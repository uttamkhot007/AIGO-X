import Redis from "ioredis";
import { EventEmitter } from "events";
import { logger } from "./logger.js";

export interface GrcEvent<T = unknown> {
  type: string;
  payload: T;
  tenantId?: number;
  userId?: number;
  timestamp: Date;
}

export interface IEventBus {
  publish<T = unknown>(type: string, payload: T, tenantId?: number, userId?: number): void;
  subscribe<T = unknown>(type: string, handler: (event: GrcEvent<T>) => void): () => void;
  readonly transportMode: "in-process" | "redis-streams";
  readonly isReady: boolean;
  shutdown(): Promise<void>;
}

class InProcessEventBus implements IEventBus {
  private emitter = new EventEmitter();
  readonly transportMode = "in-process" as const;
  readonly isReady = true;

  constructor() {
    this.emitter.setMaxListeners(200);
  }

  publish<T = unknown>(type: string, payload: T, tenantId?: number, userId?: number): void {
    const event: GrcEvent<T> = { type, payload, tenantId, userId, timestamp: new Date() };
    logger.debug({ eventType: type, tenantId, transport: "in-process" }, "Event published");
    this.emitter.emit(type, event);
    this.emitter.emit("*", event);
  }

  subscribe<T = unknown>(type: string, handler: (event: GrcEvent<T>) => void): () => void {
    const wrapped = handler as (e: GrcEvent<unknown>) => void;
    this.emitter.on(type, wrapped);
    return () => this.emitter.off(type, wrapped);
  }

  async shutdown(): Promise<void> {
    this.emitter.removeAllListeners();
  }
}

const STREAM_PREFIX = "grc:events";
const POLL_INTERVAL_MS = 100;
const MAX_BACKLOG_PER_POLL = 10;

class RedisStreamsEventBus implements IEventBus {
  private pub: Redis;
  private sub: Redis;
  private local = new EventEmitter();
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private _ready = false;

  readonly transportMode = "redis-streams" as const;
  get isReady() { return this._ready; }

  constructor(redisUrl: string) {
    this.pub = new Redis(redisUrl, { lazyConnect: true, enableReadyCheck: true });
    this.sub = new Redis(redisUrl, { lazyConnect: true, enableReadyCheck: true });
    this.local.setMaxListeners(200);
  }

  async connect(): Promise<void> {
    await this.pub.connect();
    await this.sub.connect();
    this._ready = true;
    this.startPolling();
  }

  private streamKey(type: string): string {
    return `${STREAM_PREFIX}:${type}`;
  }

  publish<T = unknown>(type: string, payload: T, tenantId?: number, userId?: number): void {
    const event: GrcEvent<T> = { type, payload, tenantId, userId, timestamp: new Date() };
    const fields: string[] = [
      "type", type,
      "payload", JSON.stringify(payload),
      "tenantId", String(tenantId ?? ""),
      "userId", String(userId ?? ""),
      "timestamp", event.timestamp.toISOString(),
    ];
    this.pub.xadd(this.streamKey(type), "*", ...fields).catch((err: Error) =>
      logger.warn({ err, eventType: type }, "Redis XADD failed; event may be lost"),
    );
    this.local.emit(type, event);
    this.local.emit("*", event);
    logger.debug({ eventType: type, tenantId, transport: "redis-streams" }, "Event published");
  }

  subscribe<T = unknown>(type: string, handler: (event: GrcEvent<T>) => void): () => void {
    const wrapped = handler as (e: GrcEvent<unknown>) => void;
    this.local.on(type, wrapped);
    return () => this.local.off(type, wrapped);
  }

  private startPolling(): void {
    const streamKeys = Object.values(Events).map((t) => this.streamKey(t));
    const ids: Record<string, string> = {};
    streamKeys.forEach((k) => { ids[k] = "$"; });

    const poll = async () => {
      if (!this._ready) return;
      try {
        const args = streamKeys.flatMap((k) => [k, ids[k] ?? "$"]);
        const results = await (this.sub as Redis).xread(
          "COUNT", MAX_BACKLOG_PER_POLL,
          "STREAMS", ...args,
        );
        if (!results) return;
        for (const [streamKey, entries] of results as [string, [string, string[]][]][]) {
          for (const [id, fields] of entries) {
            ids[streamKey] = id;
            const map: Record<string, string> = {};
            for (let i = 0; i < fields.length; i += 2) map[fields[i]] = fields[i + 1];
            const event: GrcEvent = {
              type: map["type"] ?? "",
              payload: map["payload"] ? JSON.parse(map["payload"]) : {},
              tenantId: map["tenantId"] ? Number(map["tenantId"]) : undefined,
              userId: map["userId"] ? Number(map["userId"]) : undefined,
              timestamp: map["timestamp"] ? new Date(map["timestamp"]) : new Date(),
            };
            this.local.emit(event.type, event);
            this.local.emit("*", event);
          }
        }
      } catch {
        // transient errors; next tick will retry
      }
    };

    this.pollHandle = setInterval(() => { void poll(); }, POLL_INTERVAL_MS);
  }

  async shutdown(): Promise<void> {
    this._ready = false;
    if (this.pollHandle) clearInterval(this.pollHandle);
    this.local.removeAllListeners();
    await this.pub.quit().catch(() => {});
    await this.sub.quit().catch(() => {});
  }
}

class EventBusProxy implements IEventBus {
  private impl: IEventBus = new InProcessEventBus();

  get transportMode() { return this.impl.transportMode; }
  get isReady() { return this.impl.isReady; }

  async init(): Promise<void> {
    const redisUrl = process.env["REDIS_URL"];
    if (!redisUrl) {
      logger.info("REDIS_URL not set — event bus running in-process (single-node mode)");
      return;
    }
    try {
      const bus = new RedisStreamsEventBus(redisUrl);
      await bus.connect();
      this.impl = bus;
      logger.info("Event bus connected to Redis Streams (distributed mode)");
    } catch (err) {
      logger.warn({ err }, "Redis Streams unavailable — event bus running in-process (fallback)");
    }
  }

  publish<T = unknown>(type: string, payload: T, tenantId?: number, userId?: number): void {
    this.impl.publish(type, payload, tenantId, userId);
  }

  subscribe<T = unknown>(type: string, handler: (event: GrcEvent<T>) => void): () => void {
    return this.impl.subscribe(type, handler);
  }

  async shutdown(): Promise<void> {
    return this.impl.shutdown();
  }
}

export const eventBus = new EventBusProxy();

export const Events = {
  RISK_CREATED:     "risk.created",
  RISK_UPDATED:     "risk.updated",
  RISK_DELETED:     "risk.deleted",
  CONTROL_UPDATED:  "control.updated",
  TICKET_CREATED:   "ticket.created",
  TICKET_RESOLVED:  "ticket.resolved",
  DSAR_CREATED:     "dsar.created",
  DSAR_RESOLVED:    "dsar.resolved",
  USER_LOGIN:       "user.login",
  USER_LOGGED_IN:   "user.login",
  USER_LOGOUT:      "user.logout",
  USER_REGISTERED:  "user.registered",
} as const;
