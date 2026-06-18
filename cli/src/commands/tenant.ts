import type { Command } from "commander";
import { apiRequest } from "../api.js";
import {
  success, error, info, header, label, printTable, printJson, isJsonMode, spinner,
} from "../output.js";

interface Tenant {
  id: number;
  name: string;
  slug: string;
  domain?: string;
  plan: string;
  status: string;
  seats?: number;
  licenseExpiry?: string;
  createdAt: string;
  userCount?: number;
}

export function registerTenant(program: Command): void {
  const tenant = program
    .command("tenant")
    .description("Manage tenants");

  tenant
    .command("list")
    .description("List all tenants")
    .action(async () => {
      const spin = spinner("Fetching tenants…");
      try {
        const tenants = await apiRequest<Tenant[]>("/api/tenants");
        spin.succeed("Tenants loaded");
        if (isJsonMode()) { printJson(tenants); return; }
        if (tenants.length === 0) { info("No tenants found"); return; }
        printTable(
          ["ID", "Name", "Slug", "Plan", "Status", "Seats", "Users", "Created"],
          tenants.map(t => [
            t.id,
            t.name,
            t.slug,
            t.plan,
            t.status,
            t.seats ?? "—",
            t.userCount ?? "—",
            t.createdAt.slice(0, 10),
          ])
        );
      } catch (err) {
        spin.fail("Failed");
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  tenant
    .command("get <id>")
    .description("Get details for a specific tenant")
    .action(async (id: string) => {
      const spin = spinner(`Fetching tenant ${id}…`);
      try {
        const t = await apiRequest<Tenant>(`/api/tenants/${id}`);
        spin.succeed("Tenant loaded");
        if (isJsonMode()) { printJson(t); return; }
        header(`Tenant: ${t.name}`);
        label("ID", t.id);
        label("Name", t.name);
        label("Slug", t.slug);
        label("Domain", t.domain ?? "—");
        label("Plan", t.plan);
        label("Status", t.status);
        label("Seats", t.seats ?? "—");
        label("License Expiry", t.licenseExpiry ?? "—");
        label("Users", t.userCount ?? "—");
        label("Created", t.createdAt.slice(0, 10));
      } catch (err) {
        spin.fail("Failed");
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  tenant
    .command("create")
    .description("Create a new tenant")
    .requiredOption("--name <name>", "Tenant display name")
    .option("--slug <slug>", "Unique URL slug (lowercase, hyphens only) — auto-derived from name if omitted")
    .requiredOption("--plan <plan>", "Plan (starter | professional | enterprise)")
    .option("--domain <domain>", "Custom domain")
    .option("--seats <n>", "Number of seats", parseInt)
    .action(async (opts: { name: string; slug?: string; plan: string; domain?: string; seats?: number }) => {
      const slug = opts.slug ?? opts.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const spin = spinner(`Creating tenant "${opts.name}"…`);
      try {
        const t = await apiRequest<Tenant>("/api/tenants", {
          method: "POST",
          body: { name: opts.name, slug, plan: opts.plan, domain: opts.domain },
        });
        spin.succeed(`Tenant created — ID: ${t.id}`);
        if (isJsonMode()) { printJson(t); return; }
        header(`Created: ${t.name}`);
        label("ID", t.id);
        label("Slug", t.slug);
        label("Plan", t.plan);
        label("Status", t.status);
      } catch (err) {
        spin.fail("Failed");
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  tenant
    .command("suspend <id>")
    .description("Suspend a tenant (blocks all logins)")
    .action(async (id: string) => {
      const spin = spinner(`Suspending tenant ${id}…`);
      try {
        const t = await apiRequest<Tenant>(`/api/tenants/${id}`, {
          method: "PATCH",
          body: { status: "suspended" },
        });
        spin.succeed(`Tenant ${t.id} suspended`);
        if (isJsonMode()) printJson(t);
      } catch (err) {
        spin.fail("Failed");
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  tenant
    .command("activate <id>")
    .description("Re-activate a suspended tenant")
    .action(async (id: string) => {
      const spin = spinner(`Activating tenant ${id}…`);
      try {
        const t = await apiRequest<Tenant>(`/api/tenants/${id}`, {
          method: "PATCH",
          body: { status: "active" },
        });
        spin.succeed(`Tenant ${t.id} activated`);
        if (isJsonMode()) printJson(t);
      } catch (err) {
        spin.fail("Failed");
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  tenant
    .command("delete <id>")
    .description("Permanently delete a tenant (must have no users)")
    .option("--force", "Skip confirmation prompt")
    .action(async (id: string, opts: { force?: boolean }) => {
      if (!opts.force) {
        const { createInterface } = await import("node:readline");
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise<string>(resolve =>
          rl.question(`\x1b[33m⚠\x1b[0m  Delete tenant ${id}? This cannot be undone. Type "yes" to confirm: `, resolve)
        );
        rl.close();
        if (answer.trim().toLowerCase() !== "yes") {
          info("Cancelled");
          return;
        }
      }
      const spin = spinner(`Deleting tenant ${id}…`);
      try {
        const result = await apiRequest<{ success: boolean; id: number }>(`/api/tenants/${id}`, { method: "DELETE" });
        spin.succeed(`Tenant ${result.id} deleted`);
        if (isJsonMode()) printJson(result);
      } catch (err) {
        spin.fail("Failed");
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  tenant
    .command("update <id>")
    .description("Update tenant fields")
    .option("--name <name>", "Display name")
    .option("--plan <plan>", "Plan")
    .option("--domain <domain>", "Custom domain")
    .option("--seats <n>", "Seat count", parseInt)
    .option("--license-expiry <date>", "License expiry (ISO date)")
    .action(async (id: string, opts: { name?: string; plan?: string; domain?: string; seats?: number; licenseExpiry?: string }) => {
      const spin = spinner(`Updating tenant ${id}…`);
      try {
        const body: Record<string, unknown> = {};
        if (opts.name) body["name"] = opts.name;
        if (opts.plan) body["plan"] = opts.plan;
        if (opts.domain !== undefined) body["domain"] = opts.domain;
        if (opts.seats !== undefined) body["seats"] = opts.seats;
        if (opts.licenseExpiry !== undefined) body["licenseExpiry"] = opts.licenseExpiry;
        const t = await apiRequest<Tenant>(`/api/tenants/${id}`, { method: "PATCH", body });
        spin.succeed(`Tenant ${t.id} updated`);
        if (isJsonMode()) printJson(t);
      } catch (err) {
        spin.fail("Failed");
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
