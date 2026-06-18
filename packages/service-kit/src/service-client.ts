/**
 * ServiceClient — typed HTTP client for inter-service communication.
 *
 * Each microservice should instantiate one client per upstream service it calls.
 * The base URL is injected from environment variables so the same code works
 * in Docker Compose (container names), Kubernetes (service names), and local dev.
 *
 * JWT tokens from the incoming request are forwarded automatically so
 * authentication context is preserved across service boundaries.
 *
 * Usage:
 *   const riskClient = new ServiceClient(process.env.RISK_SERVICE_URL ?? "http://risk-service:8002");
 *   const risks = await riskClient.get<Risk[]>("/api/risks", req.headers.authorization);
 */

export class ServiceClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    // Strip trailing slash for consistent URL construction
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private buildHeaders(authHeader?: string, extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...extra,
    };
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }
    return headers;
  }

  async get<T>(path: string, authHeader?: string, extra?: Record<string, string>): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: this.buildHeaders(authHeader, extra),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new ServiceClientError(res.status, `GET ${path} failed: ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  async post<T>(path: string, body: unknown, authHeader?: string, extra?: Record<string, string>): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.buildHeaders(authHeader, extra),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new ServiceClientError(res.status, `POST ${path} failed: ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  async put<T>(path: string, body: unknown, authHeader?: string, extra?: Record<string, string>): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers: this.buildHeaders(authHeader, extra),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new ServiceClientError(res.status, `PUT ${path} failed: ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  async patch<T>(path: string, body: unknown, authHeader?: string, extra?: Record<string, string>): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "PATCH",
      headers: this.buildHeaders(authHeader, extra),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new ServiceClientError(res.status, `PATCH ${path} failed: ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  async delete<T = void>(path: string, authHeader?: string, extra?: Record<string, string>): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers: this.buildHeaders(authHeader, extra),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new ServiceClientError(res.status, `DELETE ${path} failed: ${res.statusText}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  /** Convenience method — returns null on 404 instead of throwing. */
  async getOrNull<T>(path: string, authHeader?: string): Promise<T | null> {
    try {
      return await this.get<T>(path, authHeader);
    } catch (err) {
      if (err instanceof ServiceClientError && err.status === 404) return null;
      throw err;
    }
  }
}

export class ServiceClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ServiceClientError";
  }
}

// ── Pre-configured clients using standard service env vars ───────────────────
// Import and use these in any service that needs to call another service.

export const authServiceClient     = new ServiceClient(process.env["AUTH_SERVICE_URL"]        ?? "http://auth-service:8001");
export const riskServiceClient     = new ServiceClient(process.env["RISK_SERVICE_URL"]        ?? "http://risk-service:8002");
export const complianceServiceClient = new ServiceClient(process.env["COMPLIANCE_SERVICE_URL"] ?? "http://compliance-service:8003");
export const governanceServiceClient = new ServiceClient(process.env["GOVERNANCE_SERVICE_URL"] ?? "http://governance-service:8004");
export const privacyServiceClient  = new ServiceClient(process.env["PRIVACY_SERVICE_URL"]     ?? "http://privacy-service:8005");
export const evidenceServiceClient = new ServiceClient(process.env["EVIDENCE_SERVICE_URL"]    ?? "http://evidence-service:8006");
export const secopsServiceClient   = new ServiceClient(process.env["SECOPS_SERVICE_URL"]      ?? "http://secops-service:8007");
export const aiServiceClient       = new ServiceClient(process.env["AI_SERVICE_URL"]          ?? "http://ai-service:8008");
export const trustServiceClient    = new ServiceClient(process.env["TRUST_SERVICE_URL"]       ?? "http://trust-service:8009");
export const integrationServiceClient = new ServiceClient(process.env["INTEGRATION_SERVICE_URL"] ?? "http://integration-service:8010");
