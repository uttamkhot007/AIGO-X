/**
 * Minimal in-memory CAASM (Cyber Asset Attack Surface Management) store
 * for the integration-service agent pipeline.
 * Tracks assets created by agents (hardware discovered via AssetOps push).
 */

export type AssetCategory   = "Server"|"Workstation"|"IoT"|"Mobile"|"Network"|"OT"|"Cloud"|"Container"|"Unknown"|"SaaS";
export type AssetConfidence = "High"|"Medium"|"Low";
export type AssetRisk       = "Critical"|"High"|"Medium"|"Low";
export type AssetEnv        = "Production"|"Corporate"|"Development"|"DR";
export type AssetSensitivity= "Restricted"|"Confidential"|"Internal"|"Public";
export type RelType         = "network"|"app-dependency"|"identity"|"management"|"data-flow";

export interface AssetSource  { name: string; lastSeen: string; confidence: AssetConfidence; data: Record<string,string>; }
export interface AssetTimeline{ ts: string; field: string; from: string; to: string; source: string; }

export interface Asset {
  id: string; hostname: string; category: AssetCategory; confidence: AssetConfidence;
  os: string; ip: string; mac?: string; manufacturer: string;
  risk: AssetRisk; managed: boolean; dept: string;
  sources: AssetSource[]; tags: string[];
  antivirus: string; agentVersion: string; lastSeen: string;
  exposureScore: number; vulnCount: number; critVulns: number;
  location?: string; serialNumber?: string;
  environment: AssetEnv; dataSensitivity: AssetSensitivity;
  timeline: AssetTimeline[]; createdAt: string; updatedAt: string;
}

export interface AssetRelationship {
  id: string; source: string; target: string;
  type: RelType; label: string; strength: number;
  discoveredBy: string; createdAt: string;
}

export interface FilterCondition { field: string; op: "eq"|"neq"|"contains"|"gt"|"lt"|"in"; value: string | string[]; }
export interface FilterQuery { logic: "AND"|"OR"; conditions: FilterCondition[]; }

// tenant → Asset[]
const store = new Map<string, Asset[]>();

function tenantAssets(tenantId: string): Asset[] {
  if (!store.has(tenantId)) store.set(tenantId, []);
  return store.get(tenantId)!;
}

let _seq = 0;

export class CaasmService {
  getAssets(tenantId: string): Asset[] { return tenantAssets(tenantId); }

  getAsset(tenantId: string, id: string): Asset | undefined {
    return tenantAssets(tenantId).find(a => a.id === id);
  }

  createAsset(tenantId: string, data: Omit<Asset,"id"|"sources"|"timeline"|"createdAt"|"updatedAt">): Asset {
    const now = new Date().toISOString().slice(0, 10);
    const idx = ++_seq;
    const id = `AAST-${String(idx).padStart(5, "0")}`;
    const asset: Asset = {
      ...data,
      id,
      sources: [{ name: "AIGO-X Agent", lastSeen: now, confidence: "High", data: {} }],
      timeline: [],
      createdAt: now,
      updatedAt: now,
    };
    tenantAssets(tenantId).push(asset);
    return asset;
  }

  updateAsset(tenantId: string, id: string, data: Partial<Omit<Asset,"id"|"createdAt">>): Asset | null {
    const a = tenantAssets(tenantId).find(x => x.id === id);
    if (!a) return null;
    Object.assign(a, data, { updatedAt: new Date().toISOString().slice(0, 10) });
    return a;
  }

  deleteAsset(tenantId: string, id: string): boolean {
    const list = tenantAssets(tenantId);
    const i = list.findIndex(a => a.id === id);
    if (i < 0) return false;
    list.splice(i, 1);
    return true;
  }

  getAgentAssets(tenantId: string): Asset[] {
    return tenantAssets(tenantId).filter(a => a.tags.includes("aigo-agent"));
  }
}

export const caasmService = new CaasmService();
