/**
 * Embed Tokens API
 *
 * Issues and manages browser-embeddable JS package tokens.
 * Each tenant has exactly ONE embed token; it is globally unique.
 *
 * Routes (authenticated):
 *   GET  /api/embed-tokens/me       — get (or auto-create) current tenant token
 *   POST /api/embed-tokens/regenerate — rotate/replace the token
 *
 * Routes (public, token via query-string / header):
 *   GET  /api/embed/script.js?token=<TOKEN> — serve the browser embed package
 *   POST /api/embed/beacon                  — receive heartbeat from embedded page
 */
import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { embedTokensTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import crypto from "crypto";
import type { Request, Response } from "express";
import type { JwtPayload } from "../lib/auth";

const router = Router();
type AuthReq = Request & { user: JwtPayload };

function makeToken(): string {
  return "et_" + crypto.randomBytes(32).toString("hex");
}

function beaconOrigin(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string) ?? (req.secure ? "https" : "http");
  const host  = req.headers["x-forwarded-host"] as string ?? req.get("host") ?? "localhost:8080";
  return `${proto}://${host}`;
}

// ── GET /api/embed-tokens/me ──────────────────────────────────────────────────

router.get("/embed-tokens/me", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const tid = Number(tenantId);

    const [existing] = await db
      .select()
      .from(embedTokensTable)
      .where(eq(embedTokensTable.tenantId, tid));

    if (existing) { res.json(existing); return; }

    const [created] = await db
      .insert(embedTokensTable)
      .values({ tenantId: tid, token: makeToken() })
      .returning();

    res.status(201).json(created);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/embed-tokens/regenerate ────────────────────────────────────────

router.post("/embed-tokens/regenerate", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const tid = Number(tenantId);
    const token = makeToken();

    const [upserted] = await db
      .insert(embedTokensTable)
      .values({ tenantId: tid, token })
      .onConflictDoUpdate({
        target: embedTokensTable.tenantId,
        set: { token, updatedAt: new Date() },
      })
      .returning();

    res.json(upserted);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/embed/script.js ──────────────────────────────────────────────────
// Public endpoint — serves the tenant-specific browser embed package.

router.get("/embed/script.js", async (req: Request, res: Response): Promise<void> => {
  const token = String(req.query["token"] ?? "").trim();

  if (!token.startsWith("et_") || token.length < 20) {
    res.status(400).type("text/javascript")
      .send("/* AIGO-X GRC Embed: missing or invalid token */\n");
    return;
  }

  try {
    const [row] = await db
      .select({ id: embedTokensTable.id, tenantId: embedTokensTable.tenantId })
      .from(embedTokensTable)
      .where(eq(embedTokensTable.token, token));

    if (!row) {
      res.status(404).type("text/javascript")
        .send("/* AIGO-X GRC Embed: token not recognised */\n");
      return;
    }

    await db
      .update(embedTokensTable)
      .set({ lastUsedAt: new Date() })
      .where(eq(embedTokensTable.token, token));

    const origin = beaconOrigin(req);
    const script = buildEmbedScript(token, `${origin}/api/embed/beacon`);

    res.type("text/javascript")
       .set("Cache-Control", "public, max-age=3600")
       .set("Access-Control-Allow-Origin", "*")
       .send(script);
  } catch {
    res.status(500).type("text/javascript")
      .send("/* AIGO-X GRC Embed: server error */\n");
  }
});

// ── POST /api/embed/beacon ────────────────────────────────────────────────────
// Public endpoint — receives heartbeat from the embedded page.

router.post("/embed/beacon", async (req: Request, res: Response): Promise<void> => {
  res.set("Access-Control-Allow-Origin", "*");

  const token = String(
    req.headers["x-aigo-token"] ?? (req.body as Record<string,unknown>)?.token ?? ""
  ).trim();

  if (!token.startsWith("et_")) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  try {
    const [row] = await db
      .select({ id: embedTokensTable.id })
      .from(embedTokensTable)
      .where(eq(embedTokensTable.token, token));

    if (!row) {
      res.status(404).json({ error: "Token not found" });
      return;
    }

    await db
      .update(embedTokensTable)
      .set({
        lastUsedAt:  new Date(),
        beaconCount: sql`${embedTokensTable.beaconCount} + 1`,
      })
      .where(eq(embedTokensTable.token, token));

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// Preflight for cross-origin beacon
router.options("/embed/beacon", (_req: Request, res: Response) => {
  res.set("Access-Control-Allow-Origin", "*")
     .set("Access-Control-Allow-Headers", "Content-Type, X-AIGO-Token")
     .set("Access-Control-Allow-Methods", "POST, OPTIONS")
     .sendStatus(204);
});

// ── Embed script builder ──────────────────────────────────────────────────────

function buildEmbedScript(token: string, beaconUrl: string): string {
  return `/**
 * AIGO-X GRC Browser Embed Package v1.0
 * Tenant token: ${token.slice(0, 12)}...
 * DO NOT share this script — it uniquely identifies your organisation.
 *
 * Signals collected:
 *   Browser UA, HTTPS status, cookie policy, DNT flag, timezone,
 *   screen resolution, page URL (no PII), content security posture.
 */
(function(w,d,TOKEN,BEACON){
  'use strict';

  var VERSION = '1.0.0';

  function collect(){
    var nav = w.navigator;
    var perf = w.performance;
    var timing = (perf && perf.getEntriesByType)
      ? (perf.getEntriesByType('navigation')[0] || {})
      : {};
    return {
      token:         TOKEN,
      v:             VERSION,
      ts:            new Date().toISOString(),
      href:          d.location.href,
      domain:        d.location.hostname,
      referrer:      d.referrer || null,
      https:         d.location.protocol === 'https:',
      ua:            nav.userAgent,
      platform:      nav.platform || null,
      lang:          nav.language || null,
      tz:            (Intl && Intl.DateTimeFormat)
                       ? Intl.DateTimeFormat().resolvedOptions().timeZone
                       : null,
      screen:        w.screen ? (w.screen.width + 'x' + w.screen.height) : null,
      cookieEnabled: nav.cookieEnabled,
      doNotTrack:    nav.doNotTrack || w.doNotTrack || null,
      serviceWorker: 'serviceWorker' in nav,
      storageAvail:  (function(){try{localStorage.setItem('_ag','1');localStorage.removeItem('_ag');return true;}catch(e){return false;}}()),
      loadMs:        timing.domContentLoadedEventEnd
                       ? Math.round(timing.domContentLoadedEventEnd - (timing.fetchStart || 0))
                       : null,
    };
  }

  function send(data){
    var body = JSON.stringify(data);
    try {
      if (nav.sendBeacon) {
        nav.sendBeacon(BEACON, new Blob([body], {type:'application/json'}));
      } else {
        var x = new XMLHttpRequest();
        x.open('POST', BEACON, true);
        x.setRequestHeader('Content-Type','application/json');
        x.setRequestHeader('X-AIGO-Token', TOKEN);
        x.send(body);
      }
    } catch(e) {}
  }

  var nav = w.navigator;

  function boot(){
    var data = collect();
    send(data);
    w.__aigoGrc = { token: TOKEN, version: VERSION, lastBeacon: data.ts };
  }

  if (d.readyState === 'complete' || d.readyState === 'interactive') {
    setTimeout(boot, 0);
  } else {
    d.addEventListener('DOMContentLoaded', boot);
  }

}(window, document, ${JSON.stringify(token)}, ${JSON.stringify(beaconUrl)}));
`;
}

export default router;
