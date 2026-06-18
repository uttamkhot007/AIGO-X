const BASE = "/api";

export function getApiUrl(path: string): string {
  const base = (import.meta as { env: Record<string,string> }).env["BASE_URL"] ?? "/grc-platform/";
  const apiBase = base.replace(/grc-platform\/?$/, "api");
  return `${apiBase}${path}`;
}

function getToken(): string | null {
  return localStorage.getItem("grc_token");
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const viewTenant = localStorage.getItem("grc_view_tenant");
  if (viewTenant) headers["X-View-As-Tenant"] = viewTenant;
  return headers;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok && res.status !== 204) throw new Error(`DELETE ${path} failed: ${res.status}`);
}

export interface ApiRisk {
  id: number;
  riskId: string;
  severity: string;
  name: string;
  category: string;
  description: string;
  score: number;
  owner: string;
  ownerFull: string;
  trend: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiControl {
  id: number;
  controlId: string;
  framework: string;
  domain: string;
  name: string;
  status: string;
  owner: string;
  evidence: number;
  dueDate: string;
}

export interface ApiFramework {
  id: string;
  name: string;
  pct: number;
  trend: string;
  color: string;
}

export interface ApiTicket {
  id: number;
  ticketId: string;
  priority: string;
  title: string;
  category: string;
  assignee: string;
  status: string;
  sla: string;
  createdAt: string;
}

export interface ApiDsar {
  id: number;
  dsarId: string;
  type: string;
  subject: string;
  due: string;
  received: string;
  status: string;
}

export interface ApiKpisResponse {
  kpis: Array<{
    id: string;
    label: string;
    value: number;
    unit: string;
    delta: string;
    up: boolean;
  }>;
  riskSegments: Array<{
    label: string;
    count: number;
    pct: number;
    color: string;
  }>;
  frameworkCoverage: ApiFramework[];
  meta?: Record<string, unknown>;
}

export interface ApiActivityItem {
  id: string | number;
  module?: string;
  action?: string;
  item?: string;
  user?: string;
  time?: string;
  severity?: string;
  text?: string;
  dot?: string;
}

export const api = {
  dashboard: {
    kpis: () => get<ApiKpisResponse>("/dashboard/kpis"),
    activity: () => get<ApiActivityItem[]>("/dashboard/activity"),
  },
  risks: {
    list: () => get<ApiRisk[]>("/risks"),
    get: (id: string | number) => get<ApiRisk>(`/risks/${id}`),
    create: (body: Partial<ApiRisk>) => post<ApiRisk>("/risks", body),
    update: (id: string | number, body: Partial<ApiRisk>) => patch<ApiRisk>(`/risks/${id}`, body),
    delete: (id: string | number) => del(`/risks/${id}`),
    vendors: () => get<any[]>("/risks/vendors"),
    appetite: () => get<any[]>("/risks/appetite"),
    treatments: () => get<any[]>("/risks/treatments"),
  },
  compliance: {
    frameworks: () => get<ApiFramework[]>("/compliance/frameworks"),
    controls: (frameworks?: string[]) => get<ApiControl[]>(frameworks && frameworks.length > 0 ? `/compliance/controls?frameworks=${encodeURIComponent(frameworks.join(","))}` : "/compliance/controls"),
    createControl: (body: Partial<ApiControl>) => post<ApiControl>("/compliance/controls", body),
    updateControl: (id: string | number, body: Partial<ApiControl>) =>
      patch<ApiControl>(`/compliance/controls/${id}`, body),
  },
  cspm: {
    stats:     () => get<any>("/cspm/stats"),
    resources: (provider?: string) => get<any[]>(`/cspm/resources${provider ? `?provider=${provider}` : ""}`),
    findings:  (params?: { severity?: string; status?: string; provider?: string }) => {
      const q = new URLSearchParams(Object.entries(params ?? {}).filter(([, v]) => v) as [string, string][]).toString();
      return get<any[]>(`/cspm/findings${q ? `?${q}` : ""}`);
    },
    drift:     (resourceId?: string) => get<any[]>(`/cspm/drift${resourceId ? `?resourceId=${resourceId}` : ""}`),
    updateFindingStatus: (id: string, status: string) => patch<any>(`/cspm/findings/${encodeURIComponent(id)}/status`, { status }),
  },
  caasm: {
    stats:  () => get<any>("/caasm/stats"),
    assets: (params?: { page?: number; pageSize?: number; search?: string; category?: string }) => {
      const q = new URLSearchParams(Object.entries(params ?? {}).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]) as [string, string][]).toString();
      return get<any>(`/caasm/assets${q ? `?${q}` : ""}`);
    },
  },
  tickets: {
    list: () => get<ApiTicket[]>("/tickets"),
    get: (id: number) => get<ApiTicket>(`/tickets/${id}`),
    create: (body: Partial<ApiTicket>) => post<ApiTicket>("/tickets", body),
    update: (id: number, body: Partial<ApiTicket>) => patch<ApiTicket>(`/tickets/${id}`, body),
    delete: (id: number) => del(`/tickets/${id}`),
  },
  privacy: {
    dsars:   () => get<ApiDsar[]>("/privacy/dsars"),
    createDsar: (body: Partial<ApiDsar>) => post<ApiDsar>("/privacy/dsars", body),
    updateDsar: (id: number, body: Partial<ApiDsar>) => patch<ApiDsar>(`/privacy/dsars/${id}`, body),
    ropa:    () => get<any[]>("/privacy/ropa"),
    dpias:   () => get<any[]>("/privacy/dpias"),
    notices: () => get<any[]>("/privacy/notices"),
    consent: () => get<any[]>("/privacy/consent"),
    dpas:    () => get<any[]>("/privacy/dpas"),
    regs:    () => get<any[]>("/privacy/regulations"),
    score:   () => get<{ score: number; trend: number[]; subScores: { dsar: number; dpia: number; consent: number; breach: number }; insights: string[] }>("/privacy/score"),
  },
};
