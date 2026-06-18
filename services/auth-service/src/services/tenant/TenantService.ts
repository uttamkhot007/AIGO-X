import { eq } from "drizzle-orm";
import { db } from "@workspace/service-kit";
import { tenantsTable } from "@workspace/db";
import { eventBus } from "@workspace/service-kit";
import { registry } from "../../lib/service-registry";

export interface TenantCreateInput {
  name: string;
  slug: string;
  plan?: string;
}

export class TenantService {
  constructor() {
    registry.register({
      name: "tenant-service",
      path: "/api/tenants",
      status: "healthy",
      version: "1.0.0",
    });
  }

  async list() {
    return db.select().from(tenantsTable).orderBy(tenantsTable.name);
  }

  async get(id: number) {
    const [tenant] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, id))
      .limit(1);
    if (!tenant) throw new Error("NOT_FOUND");
    return tenant;
  }

  async getBySlug(slug: string) {
    const [tenant] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.slug, slug))
      .limit(1);
    if (!tenant) throw new Error("NOT_FOUND");
    return tenant;
  }

  async create(input: TenantCreateInput) {
    const [tenant] = await db
      .insert(tenantsTable)
      .values({
        name: input.name,
        slug: input.slug.toLowerCase().replace(/\s+/g, "-"),
        plan: (input.plan ?? "starter") as "starter" | "professional" | "enterprise",
      })
      .returning();

    eventBus.publish("tenant.created", { tenantId: tenant!.id, name: tenant!.name });
    return tenant!;
  }

  async update(id: number, data: Partial<TenantCreateInput>) {
    const updates: Partial<typeof tenantsTable.$inferInsert> = {};
    if (data.name) updates.name = data.name;
    if (data.plan) updates.plan = data.plan as "starter" | "professional" | "enterprise";

    const [tenant] = await db
      .update(tenantsTable)
      .set(updates)
      .where(eq(tenantsTable.id, id))
      .returning();

    if (!tenant) throw new Error("NOT_FOUND");
    return tenant;
  }

  async provision(input: TenantCreateInput) {
    const tenant = await this.create(input);
    eventBus.publish("tenant.provisioned", { tenantId: tenant.id, name: tenant.name });
    return tenant;
  }
}

export const tenantService = new TenantService();
