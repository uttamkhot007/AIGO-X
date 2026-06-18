import { requireConfig } from "./config.js";

type Method = "GET" | "POST" | "PATCH" | "DELETE" | "PUT";

export interface ApiError extends Error {
  status: number;
}

export async function apiRequest<T = unknown>(
  path: string,
  {
    method = "GET",
    body,
    stream = false,
  }: { method?: Method; body?: unknown; stream?: boolean } = {}
): Promise<T> {
  const config = requireConfig();
  const base = config.url.replace(/\/$/, "");
  const url = `${base}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      message = parsed.error ?? text;
    } catch {
      // use raw text
    }
    const err = new Error(`HTTP ${res.status}: ${message}`) as ApiError;
    err.status = res.status;
    throw err;
  }

  if (stream) {
    return res as unknown as T;
  }

  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return res.json() as Promise<T>;
  }
  return res.text() as unknown as T;
}

export async function measureLatency(url: string, token: string): Promise<{ ok: boolean; ms: number; body?: unknown }> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    const ms = Date.now() - start;
    if (!res.ok) return { ok: false, ms };
    const body = await res.json().catch(() => undefined);
    return { ok: true, ms, body };
  } catch {
    return { ok: false, ms: Date.now() - start };
  }
}
