import { randomBytes, randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { agentRefreshTokensTable, agentRecordsTable } from "@workspace/db";
import { eq, lt, and } from "drizzle-orm";

function getDb() {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) throw new Error("DATABASE_URL is required");
  return drizzle(connectionString);
}

const db = getDb();

export type AgentOS = "windows" | "linux" | "macos" | "mobile" | "cloud";
export type AgentStatus = "online" | "offline" | "warning" | "stale";

export interface AgentPolicy {
  scanSchedule: string;
  reportingIntervalSecs: number;
  dataTypes: string[];
  moduleFeeds: string[];
  logLevel: "info" | "debug" | "warn";
  maxCpuPct: number;
  maxMemMb: number;
}

export interface AgentRecord {
  id: string;
  tenantId: string;
  hostname: string;
  os: AgentOS;
  arch: string;
  version: string;
  status: AgentStatus;
  lastSeen: string;
  registeredAt: string;
  ip: string;
  tags: string[];
  health: { cpu: number; mem: number; disk: number; uptime: number };
  policy: AgentPolicy;
  pendingPush: Partial<AgentPolicy> | null;
  telemetry: { assetsDiscovered: number; eventsLastHour: number; alertsOpen: number };
  hmacSecret: string;
  publicKey?: string;
  feedActivity: Record<string, string>;
}

export interface CheckinPayload {
  agentId: string;
  health: { cpu: number; mem: number; disk: number; uptime: number };
  telemetry: { assetsDiscovered: number; eventsLastHour: number; alertsOpen: number };
  version: string;
}

export interface RegisterPayload {
  hostname: string;
  os: AgentOS;
  arch: string;
  version: string;
  ip: string;
  tags?: string[];
}

const DEFAULT_POLICY: AgentPolicy = {
  scanSchedule: "0 */4 * * *",
  reportingIntervalSecs: 60,
  dataTypes: ["inventory", "events", "vulnerabilities"],
  moduleFeeds: ["caasm", "cspm", "secops"],
  logLevel: "info",
  maxCpuPct: 15,
  maxMemMb: 256,
};

const DEFAULT_STALE_SECS = 300; // 5 minutes

class AgentGatewayService {
  private agents = new Map<string, AgentRecord>();
  /** Configurable via AGENT_STALE_THRESHOLD_SECS env var (default: 300s / 5 min). */
  private readonly staleThresholdMs: number;
  private _ready: Promise<void>;
  /** Monotonically increasing counter — always read/incremented synchronously after _ready resolves. */
  private _nextId: number = 1;

  constructor() {
    const raw = parseInt(process.env["AGENT_STALE_THRESHOLD_SECS"] ?? String(DEFAULT_STALE_SECS), 10);
    this.staleThresholdMs = (isNaN(raw) || raw <= 0 ? DEFAULT_STALE_SECS : raw) * 1000;
    this._seed();
    this._ready = this._loadFromDb();
  }

  private _seed() {
    const now = Date.now();
    const seeds: Array<Omit<AgentRecord, "id" | "registeredAt" | "hmacSecret">> = [
      {
        tenantId: "1",
        hostname: "CAASM-EU-WEST-1",
        os: "linux",
        arch: "x86_64",
        version: "2.4.1",
        status: "online",
        lastSeen: new Date(now - 30_000).toISOString(),
        ip: "10.0.1.12",
        tags: ["caasm", "eu-west-1", "production"],
        health: { cpu: 12, mem: 34, disk: 41, uptime: 1209600 },
        policy: { ...DEFAULT_POLICY, moduleFeeds: ["assetops"] },
        pendingPush: null,
        telemetry: { assetsDiscovered: 312, eventsLastHour: 847, alertsOpen: 3 },
        feedActivity: { assetops: new Date(now - 30_000).toISOString() },
      },
      {
        tenantId: "1",
        hostname: "CAASM-US-EAST-1",
        os: "linux",
        arch: "x86_64",
        version: "2.4.1",
        status: "online",
        lastSeen: new Date(now - 45_000).toISOString(),
        ip: "10.2.0.8",
        tags: ["caasm", "us-east-1", "production"],
        health: { cpu: 8, mem: 28, disk: 37, uptime: 2592000 },
        policy: { ...DEFAULT_POLICY, moduleFeeds: ["assetops"] },
        pendingPush: null,
        telemetry: { assetsDiscovered: 478, eventsLastHour: 1203, alertsOpen: 1 },
        feedActivity: { assetops: new Date(now - 45_000).toISOString() },
      },
      {
        tenantId: "1",
        hostname: "CORP-DC-01",
        os: "windows",
        arch: "x86_64",
        version: "1.8.3",
        status: "online",
        lastSeen: new Date(now - 120_000).toISOString(),
        ip: "192.168.1.5",
        tags: ["ad-connector", "domain-controller", "production"],
        health: { cpu: 5, mem: 22, disk: 58, uptime: 7776000 },
        policy: { ...DEFAULT_POLICY, dataTypes: ["ad-inventory", "gpo", "events"], moduleFeeds: ["secops", "complyops"] },
        pendingPush: null,
        telemetry: { assetsDiscovered: 847, eventsLastHour: 4201, alertsOpen: 7 },
        feedActivity: {
          secops:    new Date(now - 120_000).toISOString(),
          complyops: new Date(now - 240_000).toISOString(),
        },
      },
      {
        tenantId: "1",
        hostname: "CLOUD-AWS-AGENT",
        os: "cloud",
        arch: "x86_64",
        version: "3.1.0",
        status: "online",
        lastSeen: new Date(now - 60_000).toISOString(),
        ip: "172.16.0.1",
        tags: ["cspm", "aws", "production"],
        health: { cpu: 3, mem: 11, disk: 12, uptime: 5184000 },
        policy: { ...DEFAULT_POLICY, moduleFeeds: ["assetops", "secops", "dataops"] },
        pendingPush: null,
        telemetry: { assetsDiscovered: 63, eventsLastHour: 312, alertsOpen: 5 },
        feedActivity: {
          assetops: new Date(now - 60_000).toISOString(),
          secops:   new Date(now - 3_600_000).toISOString(),
          dataops:  new Date(now - 1_800_000).toISOString(),
        },
      },
      {
        tenantId: "1",
        hostname: "CLOUD-AZURE-AGENT",
        os: "cloud",
        arch: "x86_64",
        version: "3.1.0",
        status: "warning",
        lastSeen: new Date(now - 900_000).toISOString(),
        ip: "172.16.0.2",
        tags: ["cspm", "azure", "production"],
        health: { cpu: 71, mem: 82, disk: 65, uptime: 604800 },
        policy: { ...DEFAULT_POLICY, moduleFeeds: ["assetops", "secops"] },
        pendingPush: { maxCpuPct: 20, maxMemMb: 512 },
        telemetry: { assetsDiscovered: 41, eventsLastHour: 87, alertsOpen: 12 },
        feedActivity: {
          assetops: new Date(now - 900_000).toISOString(),
          secops:   new Date(now - 900_000).toISOString(),
        },
      },
      {
        tenantId: "1",
        hostname: "NET-BCN-HQ",
        os: "linux",
        arch: "x86_64",
        version: "2.3.9",
        status: "offline",
        lastSeen: new Date(now - 7_200_000).toISOString(),
        ip: "10.50.0.4",
        tags: ["network-audit", "barcelona", "production"],
        health: { cpu: 0, mem: 0, disk: 0, uptime: 0 },
        policy: { ...DEFAULT_POLICY, moduleFeeds: ["secops"] },
        pendingPush: null,
        telemetry: { assetsDiscovered: 28, eventsLastHour: 0, alertsOpen: 0 },
        feedActivity: { secops: new Date(now - 7_200_000).toISOString() },
      },
      {
        tenantId: "1",
        hostname: "MACOS-DEVOPS-01",
        os: "macos",
        arch: "arm64",
        version: "2.4.0",
        status: "online",
        lastSeen: new Date(now - 15_000).toISOString(),
        ip: "10.0.3.22",
        tags: ["devops", "macOS", "development"],
        health: { cpu: 18, mem: 45, disk: 62, uptime: 432000 },
        policy: { ...DEFAULT_POLICY, moduleFeeds: ["assetops", "secops"] },
        pendingPush: null,
        telemetry: { assetsDiscovered: 14, eventsLastHour: 203, alertsOpen: 0 },
        feedActivity: {
          assetops: new Date(now - 15_000).toISOString(),
          secops:   new Date(now - 600_000).toISOString(),
        },
      },
      {
        tenantId: "1",
        hostname: "MOBILE-MDM-BRIDGE",
        os: "mobile",
        arch: "arm64",
        version: "1.2.0",
        status: "online",
        lastSeen: new Date(now - 180_000).toISOString(),
        ip: "10.0.4.100",
        tags: ["mdm", "mobile", "production"],
        health: { cpu: 6, mem: 18, disk: 8, uptime: 864000 },
        policy: { ...DEFAULT_POLICY, dataTypes: ["mdm-compliance", "app-inventory"], moduleFeeds: ["complyops", "serviceops"] },
        pendingPush: null,
        telemetry: { assetsDiscovered: 203, eventsLastHour: 412, alertsOpen: 2 },
        feedActivity: {
          complyops:  new Date(now - 180_000).toISOString(),
          serviceops: new Date(now - 7_200_000).toISOString(),
        },
      },
    ];

    for (const s of seeds) {
      const id = `AGT-${String(this.agents.size + 1).padStart(3, "0")}`;
      this.agents.set(id, {
        ...s,
        id,
        registeredAt: new Date(Date.now() - Math.random() * 30 * 86400_000).toISOString(),
        hmacSecret: randomBytes(32).toString("hex"),
      });
    }
  }

  private async _loadFromDb(): Promise<void> {
    try {
      const rows = await db.select().from(agentRecordsTable);
      for (const row of rows) {
        const agentId = row.agentId;
        if (!row.hmacSecret) continue; // skip rows with no secret (legacy/seeded rows)
        const existing = this.agents.get(agentId);
        const policy = (row.policy && typeof row.policy === "object" && !Array.isArray(row.policy)
          ? row.policy as AgentPolicy
          : { ...DEFAULT_POLICY });
        const health = (row.health && typeof row.health === "object" && !Array.isArray(row.health)
          ? row.health as { cpu: number; mem: number; disk: number; uptime: number }
          : { cpu: 0, mem: 0, disk: 0, uptime: 0 });
        const telemetry = (row.telemetry && typeof row.telemetry === "object" && !Array.isArray(row.telemetry)
          ? row.telemetry as { assetsDiscovered: number; eventsLastHour: number; alertsOpen: number }
          : { assetsDiscovered: 0, eventsLastHour: 0, alertsOpen: 0 });
        const tags = Array.isArray(row.tags) ? (row.tags as string[]) : [];

        const record: AgentRecord = {
          id: agentId,
          tenantId: String(row.tenantId),
          hostname: row.hostname,
          os: (row.platform as AgentOS) ?? "linux",
          arch: existing?.arch ?? "x86_64",
          version: row.version,
          status: (row.status as AgentStatus) ?? "online",
          lastSeen: row.lastSeen.toISOString(),
          registeredAt: row.enrolledAt.toISOString(),
          ip: row.ip,
          tags,
          health,
          policy,
          pendingPush: existing?.pendingPush ?? null,
          telemetry,
          hmacSecret: row.hmacSecret,
          publicKey: row.publicKey ?? undefined,
          feedActivity: existing?.feedActivity ?? {},
        };
        this.agents.set(agentId, record);
      }
      // Advance _nextId past every agent ID currently in memory so new registrations never collide.
      for (const agentId of this.agents.keys()) {
        const m = agentId.match(/^AGT-(\d+)$/);
        if (m) {
          const n = parseInt(m[1]!, 10);
          if (n >= this._nextId) this._nextId = n + 1;
        }
      }
    } catch (err) {
      console.error("[AgentGatewayService] Failed to load agents from DB on startup:", err);
    }
  }

  async register(tenantId: string, payload: RegisterPayload & { ed25519_public_key?: string }): Promise<AgentRecord> {
    // Await DB load first so _nextId is correctly positioned past all persisted agent IDs.
    await this._ready;
    // Increment synchronously — JS is single-threaded so no two concurrent callers can read the same value.
    const id = `AGT-${String(this._nextId++).padStart(3, "0")}`;
    const hmacSecret = randomBytes(32).toString("hex");
    const now = new Date();
    const record: AgentRecord = {
      id,
      tenantId,
      hostname: payload.hostname,
      os: payload.os,
      arch: payload.arch,
      version: payload.version,
      status: "online",
      lastSeen: now.toISOString(),
      registeredAt: now.toISOString(),
      ip: payload.ip,
      tags: payload.tags ?? [],
      health: { cpu: 0, mem: 0, disk: 0, uptime: 0 },
      policy: { ...DEFAULT_POLICY },
      pendingPush: null,
      telemetry: { assetsDiscovered: 0, eventsLastHour: 0, alertsOpen: 0 },
      hmacSecret,
      publicKey: payload.ed25519_public_key,
      feedActivity: {},
    };

    await db.insert(agentRecordsTable).values({
      tenantId: parseInt(tenantId, 10),
      agentId: id,
      hostname: payload.hostname,
      platform: payload.os,
      version: payload.version,
      status: "online",
      lastSeen: now,
      ip: payload.ip,
      tags: payload.tags ?? [],
      health: record.health as any,
      policy: record.policy as any,
      telemetry: record.telemetry as any,
      hmacSecret,
      publicKey: payload.ed25519_public_key ?? null,
      enrolledAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [agentRecordsTable.tenantId, agentRecordsTable.agentId],
      set: {
        hostname: payload.hostname,
        platform: payload.os,
        version: payload.version,
        ip: payload.ip,
        hmacSecret,
        publicKey: payload.ed25519_public_key ?? null,
        updatedAt: now,
      },
    });

    this.agents.set(id, record);
    return record;
  }

  recordFeedPush(tenantId: string, agentId: string, feedKey: string): void {
    const agent = this._findById(agentId);
    if (!agent || agent.tenantId !== tenantId) return;
    agent.feedActivity[feedKey] = new Date().toISOString();
  }

  async getAgentSecrets(tenantId: string, agentId: string): Promise<{ hmacSecret: string; publicKey?: string } | null> {
    await this._ready;
    const agent = this._findById(agentId);
    if (agent && agent.tenantId === tenantId) {
      return { hmacSecret: agent.hmacSecret, publicKey: agent.publicKey };
    }
    // Fallback: query DB directly (handles agents registered before an in-memory reset)
    try {
      const rows = await db
        .select({ hmacSecret: agentRecordsTable.hmacSecret, publicKey: agentRecordsTable.publicKey })
        .from(agentRecordsTable)
        .where(and(
          eq(agentRecordsTable.agentId, agentId),
          eq(agentRecordsTable.tenantId, parseInt(tenantId, 10)),
        ))
        .limit(1);
      if (rows.length === 0 || !rows[0]!.hmacSecret) return null;
      const { hmacSecret, publicKey } = rows[0]!;
      return { hmacSecret, publicKey: publicKey ?? undefined };
    } catch {
      return null;
    }
  }

  checkin(tenantId: string, agentId: string, payload: CheckinPayload): AgentRecord | null {
    const agent = this._findById(agentId);
    if (!agent || agent.tenantId !== tenantId) return null;
    agent.lastSeen = new Date().toISOString();
    agent.health = payload.health;
    agent.telemetry = payload.telemetry;
    agent.version = payload.version;
    agent.status = payload.health.cpu > 80 || payload.health.mem > 85 ? "warning" : "online";
    return agent;
  }

  getPendingPush(tenantId: string, agentId: string): Partial<AgentPolicy> | null {
    const agent = this._findById(agentId);
    if (!agent || agent.tenantId !== tenantId) return null;
    const push = agent.pendingPush;
    agent.pendingPush = null;
    return push;
  }

  listAgents(tenantId: string): AgentRecord[] {
    return Array.from(this.agents.values())
      .filter(a => a.tenantId === tenantId)
      .map(a => this._withComputedStatus(a));
  }

  getAgent(tenantId: string, agentId: string): AgentRecord | null {
    const a = this._findById(agentId);
    if (!a || a.tenantId !== tenantId) return null;
    return this._withComputedStatus(a);
  }

  updatePolicy(tenantId: string, agentId: string, policy: Partial<AgentPolicy>): AgentRecord | null {
    const agent = this.getAgent(tenantId, agentId);
    if (!agent) return null;
    Object.assign(agent.policy, policy);
    agent.pendingPush = { ...policy };
    return agent;
  }

  deleteAgent(tenantId: string, agentId: string): boolean {
    const agent = this.getAgent(tenantId, agentId);
    if (!agent) return false;
    this.agents.delete(agentId);
    return true;
  }

  getStats(tenantId: string) {
    const agents = this.listAgents(tenantId);
    return {
      total: agents.length,
      online: agents.filter(a => a.status === "online").length,
      warning: agents.filter(a => a.status === "warning").length,
      offline: agents.filter(a => a.status === "offline").length,
      stale: agents.filter(a => a.status === "stale").length,
      totalAssets: agents.reduce((s, a) => s + a.telemetry.assetsDiscovered, 0),
      byOs: {
        windows: agents.filter(a => a.os === "windows").length,
        linux:   agents.filter(a => a.os === "linux").length,
        macos:   agents.filter(a => a.os === "macos").length,
        mobile:  agents.filter(a => a.os === "mobile").length,
        cloud:   agents.filter(a => a.os === "cloud").length,
      },
      versionDistribution: this._versionDist(agents),
    };
  }

  private _versionDist(agents: AgentRecord[]) {
    const dist: Record<string, number> = {};
    for (const a of agents) {
      dist[a.version] = (dist[a.version] ?? 0) + 1;
    }
    return Object.entries(dist).map(([version, count]) => ({ version, count }));
  }

  private _withComputedStatus(agent: AgentRecord): AgentRecord {
    // Explicit "offline" is a deliberate state — never auto-promote to stale
    if (agent.status === "offline") return agent;
    const gap = Date.now() - new Date(agent.lastSeen).getTime();
    if (gap > this.staleThresholdMs) {
      return { ...agent, status: "stale" };
    }
    return agent;
  }

  async createRefreshToken(agentId: string, tenantId: number): Promise<string> {
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.insert(agentRefreshTokensTable).values({ token, agentId, tenantId, expiresAt });
    this._pruneExpiredTokens().catch(() => {});
    return token;
  }

  async consumeRefreshToken(token: string): Promise<{ agentId: string; tenantId: number } | null> {
    const rows = await db
      .delete(agentRefreshTokensTable)
      .where(eq(agentRefreshTokensTable.token, token))
      .returning();
    if (rows.length === 0) return null;
    const row = rows[0]!;
    if (row.expiresAt < new Date()) return null;
    return { agentId: row.agentId, tenantId: row.tenantId };
  }

  private async _pruneExpiredTokens(): Promise<void> {
    await db.delete(agentRefreshTokensTable).where(lt(agentRefreshTokensTable.expiresAt, new Date()));
  }

  private _findById(id: string): AgentRecord | undefined {
    return this.agents.get(id);
  }
}

export const agentGatewayService = new AgentGatewayService();
