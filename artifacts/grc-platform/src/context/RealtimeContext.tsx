import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API_BASE = BASE.replace("/grc-platform", "");

// ── Types ──────────────────────────────────────────────────────────────────

export interface LiveNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  module: string;
  time: string;
  read: boolean;
  severity?: "critical" | "high" | "medium" | "low";
  dot: string;
  timestamp: Date;
}

export interface OnlineUser {
  userId: number;
  name: string;
  initials: string;
  role: string;
  lastSeen: number;
}

interface RealtimeContextValue {
  notifications: LiveNotification[];
  unreadCount: number;
  onlineUsers: OnlineUser[];
  markAllRead: () => void;
  markRead: (id: string) => void;
  connected: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const EVENT_LABEL: Record<string, { title: string; module: string; severity?: "critical" | "high" | "medium" | "low"; dot: string }> = {
  "risk.created":    { title: "New Risk Created",       module: "RiskOps",       severity: "high",     dot: "#F59E0B" },
  "risk.updated":    { title: "Risk Updated",           module: "RiskOps",       severity: "medium",   dot: "#3B82F6" },
  "risk.deleted":    { title: "Risk Removed",           module: "RiskOps",       dot: "#6B7280" },
  "control.updated": { title: "Control Updated",        module: "ComplianceOps", dot: "#10B981" },
  "ticket.created":  { title: "New Ticket Opened",      module: "ServiceOps",    dot: "#8B5CF6" },
  "ticket.resolved": { title: "Ticket Resolved",        module: "ServiceOps",    dot: "#10B981" },
  "dsar.created":    { title: "DSAR Received",          module: "PrivacyOps",    severity: "medium",   dot: "#F59E0B" },
  "dsar.resolved":   { title: "DSAR Resolved",          module: "PrivacyOps",    dot: "#10B981" },
  "user.login":      { title: "User Signed In",         module: "SecOps",        dot: "#6B7280" },
  "user.logout":     { title: "User Signed Out",        module: "SecOps",        dot: "#6B7280" },
  "user.registered": { title: "New User Registered",   module: "Admin",         dot: "#6366F1" },
};

function relativeTime(ts: Date): string {
  const secs = Math.floor((Date.now() - ts.getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} hour${secs < 7200 ? "" : "s"} ago`;
  return ts.toLocaleDateString();
}

function eventToNotification(raw: {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}): LiveNotification {
  const meta = EVENT_LABEL[raw.type] ?? { title: raw.type, module: "System", dot: "#6B7280" };
  const ts = new Date(raw.timestamp);
  const payload = raw.payload as Record<string, string>;
  const body =
    payload.name
      ? String(payload.name)
      : payload.description
        ? String(payload.description).slice(0, 80)
        : meta.title;

  return {
    id: raw.id,
    type: raw.type,
    title: meta.title,
    body,
    module: meta.module,
    time: relativeTime(ts),
    read: false,
    severity: meta.severity,
    dot: meta.dot,
    timestamp: ts,
  };
}

// ── Context ────────────────────────────────────────────────────────────────

const RealtimeContext = createContext<RealtimeContextValue>({
  notifications: [],
  unreadCount: 0,
  onlineUsers: [],
  markAllRead: () => {},
  markRead: () => {},
  connected: false,
});

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<LiveNotification[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [connected, setConnected] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const presenceRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);

  const token = typeof window !== "undefined" ? localStorage.getItem("grc_token") : null;

  const sendPresence = useCallback(() => {
    if (!token || !user) return;
    const initials = (user.name ?? user.email ?? "??")
      .split(" ")
      .map((w: string) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    fetch(`${API_BASE}/api/presence`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: user.name ?? user.email, initials, role: user.role }),
    }).catch(() => {});
  }, [token, user]);

  const connect = useCallback(() => {
    if (!token || !user) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const url = `${API_BASE}/api/events`;

    fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    }).then(async (res) => {
      if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);
      setConnected(true);
      retryCount.current = 0;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      const parseSseChunk = (chunk: string) => {
        const blocks = (buf + chunk).split("\n\n");
        buf = blocks.pop() ?? "";
        for (const block of blocks) {
          let eventType = "message";
          let data = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            else if (line.startsWith("data: ")) data = line.slice(6).trim();
          }
          if (!data) continue;
          try {
            if (eventType === "activity") {
              const raw = JSON.parse(data) as { id: string; type: string; payload: Record<string, unknown>; timestamp: string };
              if (raw.type === "presence.changed" || raw.type === "user.login" || raw.type === "user.logout") continue;
              setNotifications(prev => [eventToNotification(raw), ...prev].slice(0, 50));
            } else if (eventType === "presence") {
              setOnlineUsers(JSON.parse(data) as OnlineUser[]);
            }
          } catch { /* malformed */ }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parseSseChunk(decoder.decode(value, { stream: true }));
      }
      throw new Error("SSE stream ended");
    }).catch((err: unknown) => {
      if (ctrl.signal.aborted) return;
      setConnected(false);
      abortRef.current = null;
      const delay = Math.min(2000 * Math.pow(2, retryCount.current), 30_000);
      retryCount.current += 1;
      void err;
      retryRef.current = setTimeout(connect, delay);
    });
  }, [token, user]);

  useEffect(() => {
    if (!user || !token) {
      setConnected(false);
      return;
    }

    connect();

    // Send presence heartbeat every 25s
    sendPresence();
    presenceRef.current = setInterval(sendPresence, 25_000);

    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
      if (presenceRef.current) clearInterval(presenceRef.current);
      if (retryRef.current) clearTimeout(retryRef.current);
      setConnected(false);
      // Signal offline
      if (token) {
        fetch(`${API_BASE}/api/presence`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
          keepalive: true,
        }).catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userId, token]);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <RealtimeContext.Provider value={{ notifications, unreadCount, onlineUsers, markAllRead, markRead, connected }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  return useContext(RealtimeContext);
}
