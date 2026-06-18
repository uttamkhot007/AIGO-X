import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { usersTable } from "@workspace/db";
import QRCode from "qrcode";
import {
  hashPassword,
  comparePassword,
  signToken,
  signTempToken,
  verifyTempToken,
  requireAuth,
} from "../lib/auth";
import type { JwtPayload } from "../lib/auth";
import { eventBus, Events } from "../lib/event-bus";
import { generateSecret, generateURI, verifySync } from "otplib";

const router = Router();

// POST /auth/login
// • MFA disabled → returns full access JWT immediately
// • MFA enabled  → returns a short-lived pre-auth challenge token only;
//                  the full JWT is issued only after /auth/mfa/verify succeeds.
router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    if (!email || !password) {
      res.status(400).json({ error: "Email and password required" });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase().trim()))
      .limit(1);

    if (!user || !(await comparePassword(password, user.passwordHash))) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    await db.update(usersTable).set({ lastLogin: new Date() }).where(eq(usersTable.id, user.id));
    eventBus.publish(Events.USER_LOGIN, { userId: user.id }, user.tenantId, user.id);

    const safeUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      mfaEnabled: user.mfaEnabled,
      lastLogin: user.lastLogin?.toISOString() ?? null,
      avatar: user.avatar,
      createdAt: user.createdAt.toISOString(),
    };

    if (user.mfaEnabled) {
      // Do NOT issue a full JWT — only a 10-minute challenge token
      const tempToken = signTempToken({
        userId: user.id,
        tenantId: user.tenantId,
        email: user.email,
      });
      res.json({ token: "", tempToken, mfaRequired: true, user: safeUser });
      return;
    }

    const token = signToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    });
    res.json({ token, mfaRequired: null, user: safeUser });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /auth/logout
router.post("/auth/logout", requireAuth, (req, res) => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  eventBus.publish(Events.USER_LOGOUT, { userId: user.userId }, user.tenantId, user.userId);
  res.json({ success: true });
});

// GET /auth/me
router.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const { userId } = (req as typeof req & { user: JwtPayload }).user;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      mfaEnabled: user.mfaEnabled,
      lastLogin: user.lastLogin?.toISOString() ?? null,
      avatar: user.avatar,
      createdAt: user.createdAt.toISOString(),
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/auth/refresh
// Re-issues a fresh JWT with the user's current role from the DB.
// Useful when an admin's role is changed server-side and the old JWT is stale.
router.get("/auth/refresh", requireAuth, async (req, res) => {
  try {
    const { userId } = (req as typeof req & { user: JwtPayload }).user;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    const token = signToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    });
    res.json({ token, role: user.role });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /auth/mfa/verify
// Completes an MFA login challenge. Requires the pre-auth challenge token
// (NOT a full access token — requireAuth is intentionally absent here).
// On success, issues the full access JWT.
router.post("/auth/mfa/verify", async (req, res) => {
  try {
    const { tempToken, token } = req.body as { tempToken: string; token: string };

    if (!tempToken) {
      res.status(400).json({ error: "tempToken required — obtain it from POST /auth/login when mfaRequired is true" });
      return;
    }
    if (!token || !/^\d{6}$/.test(token)) {
      res.status(400).json({ error: "token must be exactly 6 digits" });
      return;
    }

    let challenge;
    try {
      challenge = verifyTempToken(tempToken);
    } catch {
      res.status(401).json({ error: "Invalid or expired MFA challenge — please log in again" });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, challenge.userId))
      .limit(1);

    if (!user || !user.mfaSecret || !user.mfaEnabled) {
      res.status(400).json({ error: "MFA is not configured for this account" });
      return;
    }

    const result = verifySync({ secret: user.mfaSecret, token });
    if (!result.valid) {
      res.status(401).json({ error: "Invalid or expired TOTP token" });
      return;
    }

    // Challenge accepted — issue the full access JWT
    const accessToken = signToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    });

    res.json({
      token: accessToken,
      mfaRequired: null,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        mfaEnabled: user.mfaEnabled,
        lastLogin: user.lastLogin?.toISOString() ?? null,
        avatar: user.avatar,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /auth/mfa/setup
// In-session — requires full access JWT. Generates a real TOTP secret for
// the authenticated user and returns setup details for QR scanning.
router.post("/auth/mfa/setup", requireAuth, async (req, res) => {
  try {
    const { userId, email } = (req as typeof req & { user: JwtPayload }).user;

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    // Reuse pending secret if setup started but not yet confirmed
    const secret =
      user.mfaSecret && !user.mfaEnabled
        ? user.mfaSecret
        : generateSecret({ length: 20 });

    if (!user.mfaSecret || !user.mfaEnabled) {
      await db.update(usersTable).set({ mfaSecret: secret }).where(eq(usersTable.id, userId));
    }

    const otpauthUrl = generateURI({ issuer: "AIGO-X GRC", label: email, secret });
    // Generate QR code locally — no third-party service, no TOTP secret in outbound URLs
    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl, { width: 200, margin: 2 });

    const backupCodes = Array.from({ length: 8 }, (_, i) => {
      const chunk = secret.slice(i * 2, i * 2 + 4).toUpperCase().padEnd(4, "X");
      const tail = String(i * 1117 + 3791).slice(-4);
      return `${chunk}-${tail}`;
    });

    res.json({ secret, qrCodeUrl, backupCodes });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /auth/mfa/confirm
// In-session — verifies first TOTP token after setup to enable MFA.
router.post("/auth/mfa/confirm", requireAuth, async (req, res) => {
  try {
    const { userId } = (req as typeof req & { user: JwtPayload }).user;
    const { token } = req.body as { token: string };

    if (!token || !/^\d{6}$/.test(token)) {
      res.status(400).json({ error: "token must be exactly 6 digits" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user || !user.mfaSecret) {
      res.status(400).json({ error: "MFA setup not initiated — call /auth/mfa/setup first" });
      return;
    }
    if (user.mfaEnabled) {
      res.status(400).json({ error: "MFA is already enabled" });
      return;
    }

    const result = verifySync({ secret: user.mfaSecret, token });
    if (!result.valid) {
      res.status(401).json({ error: "Invalid or expired TOTP token" });
      return;
    }

    await db.update(usersTable).set({ mfaEnabled: true }).where(eq(usersTable.id, userId));
    res.json({ success: true, mfaEnabled: true });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /auth/mfa/disable
// In-session — requires full access JWT and current TOTP token.
router.post("/auth/mfa/disable", requireAuth, async (req, res) => {
  try {
    const { userId } = (req as typeof req & { user: JwtPayload }).user;
    const { token } = req.body as { token: string };

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user || !user.mfaSecret || !user.mfaEnabled) {
      res.status(400).json({ error: "MFA is not enabled" });
      return;
    }

    const result = verifySync({ secret: user.mfaSecret, token });
    if (!result.valid) {
      res.status(401).json({ error: "Invalid TOTP token — provide current 6-digit code to disable MFA" });
      return;
    }

    await db
      .update(usersTable)
      .set({ mfaEnabled: false, mfaSecret: null })
      .where(eq(usersTable.id, userId));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /auth/register
// Public endpoint — creates a new user account in the default tenant.
// New accounts are provisioned as "analyst" role; admins can elevate via /users/:id.
router.post("/auth/register", async (req, res) => {
  try {
    const { email, name, password } = req.body as { email: string; name: string; password: string };

    if (!email || !name || !password) {
      res.status(400).json({ error: "email, name, and password are required" });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "password must be at least 8 characters" });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check for duplicate email
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    // Default to tenant_id = 1 (the platform's first tenant).
    // In a multi-tenant deployment, use an invitation token or domain lookup.
    const DEFAULT_TENANT_ID = 1;

    const passwordHash = await hashPassword(password);
    const [user] = await db
      .insert(usersTable)
      .values({
        email: normalizedEmail,
        name,
        role: "analyst",
        tenantId: DEFAULT_TENANT_ID,
        passwordHash,
        mfaEnabled: false,
      })
      .returning();

    eventBus.publish(Events.USER_REGISTERED, { userId: user.id }, DEFAULT_TENANT_ID, user.id);

    // Auto-issue token so the user is immediately logged in
    const token = signToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    });

    res.status(201).json({
      token,
      mfaRequired: null,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        mfaEnabled: user.mfaEnabled,
        lastLogin: null,
        avatar: user.avatar ?? null,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
