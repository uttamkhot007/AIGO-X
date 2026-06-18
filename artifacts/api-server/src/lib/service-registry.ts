/**
 * Service Registry
 *
 * Tracks health of all internal microservice modules.
 * In this monolith-first deployment, services share a process;
 * the registry acts as a gateway abstraction that would front
 * true remote services in a fully distributed deployment.
 *
 * startHealthPolling() pings each registered service's health
 * sub-path on a configurable interval and updates status accordingly.
 */

import http from "http";
import { logger } from "./logger";

export interface ServiceInfo {
  name: string;
  path: string;
  status: "healthy" | "degraded" | "offline";
  lastChecked: Date;
  version: string;
  /** Optional sub-path for health probes (defaults to /healthz relative to service path) */
  healthPath?: string;
}

class ServiceRegistry {
  private services = new Map<string, ServiceInfo>();
  private pollHandle: ReturnType<typeof setInterval> | null = null;

  register(service: Omit<ServiceInfo, "lastChecked">): void {
    this.services.set(service.name, { ...service, lastChecked: new Date() });
    logger.info({ service: service.name }, "Service registered");
  }

  setStatus(name: string, status: ServiceInfo["status"]): void {
    const svc = this.services.get(name);
    if (svc) {
      svc.status = status;
      svc.lastChecked = new Date();
    }
  }

  getAll(): ServiceInfo[] {
    return Array.from(this.services.values());
  }

  get(name: string): ServiceInfo | undefined {
    return this.services.get(name);
  }

  isHealthy(name: string): boolean {
    return this.services.get(name)?.status === "healthy";
  }

  /** Overall platform status — degraded if any service is degraded, offline if any is offline. */
  overallStatus(): "healthy" | "degraded" | "offline" {
    const statuses = Array.from(this.services.values()).map(s => s.status);
    if (statuses.includes("offline")) return "offline";
    if (statuses.includes("degraded")) return "degraded";
    return "healthy";
  }

  /**
   * Starts periodic health polling.
   * Each registered service is probed by making an HTTP GET to its health path.
   * Services that respond 2xx are marked healthy; non-2xx or timeout → degraded.
   *
   * @param port      The local server port to probe (must be known after server.listen)
   * @param intervalMs Poll interval in milliseconds (default 30 s)
   */
  startHealthPolling(port: number, intervalMs = 30_000): void {
    if (this.pollHandle) return; // already polling

    const probe = (svc: ServiceInfo): Promise<void> => {
      return new Promise<void>((resolve) => {
        const healthPath = svc.healthPath ?? "/api/healthz";
        const opts = { hostname: "127.0.0.1", port, path: healthPath, method: "GET", timeout: 5000 };
        const req = http.request(opts, (res) => {
          const ok = res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300;
          this.setStatus(svc.name, ok ? "healthy" : "degraded");
          // Drain the body to free the socket
          res.resume();
          resolve();
        });
        req.on("error", () => { this.setStatus(svc.name, "degraded"); resolve(); });
        req.on("timeout", () => { req.destroy(); this.setStatus(svc.name, "degraded"); resolve(); });
        req.end();
      });
    };

    const runPolls = () => {
      const services = this.getAll();
      Promise.allSettled(services.map(probe)).catch(() => {});
    };

    // Run once immediately after a short delay (server needs to be ready)
    setTimeout(runPolls, 2000);
    this.pollHandle = setInterval(runPolls, intervalMs);
    logger.info({ intervalMs }, "Service health polling started");
  }

  stopHealthPolling(): void {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }
}

export const registry = new ServiceRegistry();

// ── Register all internal microservice modules ────────────────────────────────

const services: Omit<ServiceInfo, "lastChecked">[] = [
  { name: "auth-service",        path: "/api/auth",       status: "healthy", version: "1.0.0" },
  { name: "tenant-service",      path: "/api/tenants",    status: "healthy", version: "1.0.0" },
  { name: "user-service",        path: "/api/users",      status: "healthy", version: "1.0.0" },
  { name: "risk-service",        path: "/api/risks",      status: "healthy", version: "1.0.0" },
  { name: "compliance-service",  path: "/api/compliance", status: "healthy", version: "1.0.0" },
  { name: "security-service",    path: "/api/security",   status: "healthy", version: "1.0.0" },
  { name: "privacy-service",     path: "/api/privacy",    status: "healthy", version: "1.0.0" },
  { name: "servicedesk-service", path: "/api/tickets",    status: "healthy", version: "1.0.0" },
  { name: "dashboard-service",   path: "/api/dashboard",  status: "healthy", version: "1.0.0" },
];

services.forEach(s => registry.register(s));
