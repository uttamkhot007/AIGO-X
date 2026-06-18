import { eq } from "drizzle-orm";
import { db } from "@workspace/service-kit";
import { usersTable, tenantsTable } from "@workspace/db";
import { signToken, hashPassword, verifyPassword } from "@workspace/service-kit";
import { eventBus, Events } from "@workspace/service-kit";
import { registry } from "../../lib/service-registry";

export interface LoginResult {
  token: string;
  user: {
    id: number;
    email: string;
    name: string;
    role: string;
    tenantId: number;
    tenantName: string;
  };
}

export class AuthService {
  constructor() {
    registry.register({
      name: "auth-service",
      path: "/api/auth",
      status: "healthy",
      version: "1.0.0",
    });
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const normalizedEmail = email.toLowerCase().trim();
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .limit(1);

    if (!user) throw new Error("INVALID_CREDENTIALS");

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) throw new Error("INVALID_CREDENTIALS");

    const [tenant] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, user.tenantId))
      .limit(1);

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    });

    eventBus.publish(Events.USER_LOGGED_IN, { userId: user.id, email: user.email }, user.tenantId, user.id);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        tenantName: tenant?.name ?? "Unknown",
      },
    };
  }

  async register(
    tenantId: number,
    email: string,
    name: string,
    password: string,
    role: string
  ) {
    const normalizedEmail = email.toLowerCase().trim();
    const passwordHash = await hashPassword(password);

    const [user] = await db
      .insert(usersTable)
      .values({ tenantId, email: normalizedEmail, name, passwordHash, role })
      .returning();

    eventBus.publish(Events.USER_REGISTERED, { userId: user!.id, email: user!.email }, tenantId);

    return { id: user!.id, email: user!.email, name: user!.name, role: user!.role };
  }

  async getMe(userId: number, tenantId: number) {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user || user.tenantId !== tenantId) throw new Error("NOT_FOUND");

    const [tenant] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .limit(1);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      tenantName: tenant?.name ?? "Unknown",
      createdAt: user.createdAt,
    };
  }
}

export const authService = new AuthService();
