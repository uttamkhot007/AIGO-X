import { Router } from "express";
import { requireAuth } from "@workspace/service-kit";
import { eventBus } from "@workspace/service-kit";
import type { Request } from "express";
import type { JwtPayload } from "@workspace/service-kit";

const router = Router();

interface PresenceEntry {
  userId: number;
  name: string;
  initials: string;
  role: string;
  lastSeen: number;
}

const presenceStore = new Map<string, PresenceEntry>();
const PRESENCE_TTL_MS = 35_000;

function presenceKey(tenantId: number, userId: number) {
  return `${tenantId}:${userId}`;
}

function prunePresence() {
  const now = Date.now();
  for (const [key, entry] of presenceStore) {
    if (now - entry.lastSeen > PRESENCE_TTL_MS) presenceStore.delete(key);
  }
}

function getOnlineUsers(tenantId: number): PresenceEntry[] {
  prunePresence();
  return [...presenceStore.entries()]
    .filter(([key]) => key.startsWith(`${tenantId}:`))
    .map(([, entry]) => entry);
}

// GET /api/events — SSE stream of domain events + presence updates
// Authorization header required (use fetch+ReadableStream on the client, not EventSource)
router.get("/events", requireAuth, (req: Request, res) => {
  const user = (req as Request & { user: JwtPayload }).user;
  const tenantId = user.tenantId;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (eventType: string, data: unknown) => {
    try {
      res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      // client disconnected
    }
  };

  // Send current presence immediately on connect
  send("presence", getOnlineUsers(tenantId));

  // Heartbeat every 20s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 20_000);

  // Subscribe to all domain events; forward tenant-scoped ones
  const unsubAll = eventBus.subscribe("*", (event) => {
    if (event.tenantId !== undefined && event.tenantId !== tenantId) return;
    send("activity", {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: event.type,
      payload: event.payload,
      tenantId: event.tenantId,
      userId: event.userId,
      timestamp: event.timestamp,
    });
  });

  // Broadcast presence changes to all SSE clients in this process
  const unsubPresence = eventBus.subscribe("presence.changed", (event) => {
    if (event.tenantId !== tenantId) return;
    send("presence", getOnlineUsers(tenantId));
  });

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubAll();
    unsubPresence();
  });
});

// POST /api/presence — heartbeat to register / refresh online status
router.post("/presence", requireAuth, (req: Request, res) => {
  const user = (req as Request & { user: JwtPayload }).user;
  const { name, initials, role } = req.body as {
    name?: string;
    initials?: string;
    role?: string;
  };

  const key = presenceKey(user.tenantId, user.userId);
  const existing = presenceStore.get(key);
  presenceStore.set(key, {
    userId: user.userId,
    name: name ?? existing?.name ?? user.email,
    initials: initials ?? existing?.initials ?? "??",
    role: role ?? existing?.role ?? user.role,
    lastSeen: Date.now(),
  });

  // Notify other SSE clients that presence changed
  eventBus.publish("presence.changed", {}, user.tenantId, user.userId);

  res.json({ ok: true, online: getOnlineUsers(user.tenantId) });
});

// DELETE /api/presence — explicit offline signal on logout
router.delete("/presence", requireAuth, (req: Request, res) => {
  const user = (req as Request & { user: JwtPayload }).user;
  presenceStore.delete(presenceKey(user.tenantId, user.userId));
  eventBus.publish("presence.changed", {}, user.tenantId, user.userId);
  res.json({ ok: true });
});

// GET /api/presence — query who's online for the current tenant
router.get("/presence", requireAuth, (req: Request, res) => {
  const user = (req as Request & { user: JwtPayload }).user;
  res.json(getOnlineUsers(user.tenantId));
});

export default router;
