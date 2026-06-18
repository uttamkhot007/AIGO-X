import { eq, and } from "drizzle-orm";
import { db } from "../../lib/db";
import { usersTable } from "@workspace/db";
import { hashPassword } from "../../lib/auth";
import { registry } from "../../lib/service-registry";

export type UserRole =
  | "super_admin"
  | "tenant_admin"
  | "ciso"
  | "cro"
  | "cdpo"
  | "chro"
  | "management"
  | "security_analyst"
  | "risk_analyst"
  | "compliance_analyst"
  | "privacy_analyst"
  | "it_admin"
  | "vendor"
  | "employee";

export const ALL_ROLES: UserRole[] = [
  "super_admin",
  "tenant_admin",
  "ciso",
  "cro",
  "cdpo",
  "chro",
  "management",
  "security_analyst",
  "risk_analyst",
  "compliance_analyst",
  "privacy_analyst",
  "it_admin",
  "vendor",
  "employee",
];

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  super_admin:        ["*"],
  tenant_admin:       ["tenant.*", "users.*", "settings.*"],
  ciso:               ["risk.*", "security.*", "compliance.*", "privacy.*", "reports.*", "ai.*"],
  cro:                ["risk.*", "reports.*", "dashboard.*"],
  cdpo:               ["privacy.*", "dsars.*", "dpias.*", "reports.*"],
  chro:               ["users.read", "privacy.read", "reports.*"],
  management:         ["dashboard.*", "reports.*", "risk.read", "compliance.read"],
  security_analyst:   ["security.*", "risk.read", "findings.*", "tickets.*"],
  risk_analyst:       ["risk.*", "compliance.read", "reports.*"],
  compliance_analyst: ["compliance.*", "controls.*", "evidence.*"],
  privacy_analyst:    ["privacy.*", "dsars.*", "dpias.*"],
  it_admin:           ["security.*", "tickets.*", "assets.*"],
  vendor:             ["dashboard.read", "reports.read"],
  employee:           ["tickets.create", "dashboard.read"],
};

export class UserService {
  constructor() {
    registry.register({
      name: "user-service",
      path: "/api/users",
      status: "healthy",
      version: "1.0.0",
    });
  }

  async listByTenant(tenantId: number) {
    return db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        role: usersTable.role,
        tenantId: usersTable.tenantId,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(eq(usersTable.tenantId, tenantId))
      .orderBy(usersTable.name);
  }

  async get(id: number, tenantId: number) {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, id), eq(usersTable.tenantId, tenantId)))
      .limit(1);
    if (!user) throw new Error("NOT_FOUND");
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      createdAt: user.createdAt,
    };
  }

  async create(tenantId: number, email: string, name: string, password: string, role: string) {
    const passwordHash = await hashPassword(password);
    const [user] = await db
      .insert(usersTable)
      .values({ tenantId, email: email.toLowerCase().trim(), name, passwordHash, role })
      .returning();
    return { id: user!.id, email: user!.email, name: user!.name, role: user!.role };
  }

  async update(id: number, tenantId: number, data: { name?: string; role?: string; email?: string }) {
    const updates: Partial<typeof usersTable.$inferInsert> = {};
    if (data.name) updates.name = data.name;
    if (data.role) updates.role = data.role;
    if (data.email) updates.email = data.email.toLowerCase().trim();

    const [user] = await db
      .update(usersTable)
      .set(updates)
      .where(and(eq(usersTable.id, id), eq(usersTable.tenantId, tenantId)))
      .returning();

    if (!user) throw new Error("NOT_FOUND");
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  async delete(id: number, tenantId: number) {
    await db
      .delete(usersTable)
      .where(and(eq(usersTable.id, id), eq(usersTable.tenantId, tenantId)));
  }

  getPermissions(role: string): string[] {
    return ROLE_PERMISSIONS[role as UserRole] ?? [];
  }

  hasPermission(role: string, permission: string): boolean {
    const perms = this.getPermissions(role);
    if (perms.includes("*")) return true;
    const [ns, action] = permission.split(".");
    return perms.includes(permission) || perms.includes(`${ns}.*`);
  }
}

export const userService = new UserService();
