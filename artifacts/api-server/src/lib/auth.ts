import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";

const JWT_SECRET_VALUE = process.env["JWT_SECRET"];
if (!JWT_SECRET_VALUE) {
  throw new Error("JWT_SECRET environment variable is required");
}
const JWT_SECRET: string = JWT_SECRET_VALUE;
const JWT_EXPIRES_IN = "24h";
const MFA_CHALLENGE_EXPIRES_IN = "10m";

// ── Full-access token ─────────────────────────────────────────────────────────

export interface JwtPayload {
  userId: number;
  tenantId: number;
  role: string;
  email: string;
  /** Absent on full-access tokens; present only on pre-auth challenge tokens. */
  scope?: never;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & { scope?: string };
  if (decoded.scope === "mfa-challenge") {
    throw new Error("Pre-auth challenge token cannot be used as an access token");
  }
  return decoded as JwtPayload;
}

// ── Pre-auth MFA challenge token (not an access token) ───────────────────────

export interface PreAuthPayload {
  userId: number;
  tenantId: number;
  email: string;
  scope: "mfa-challenge";
}

/** Signs a short-lived MFA challenge token (returned as `tempToken` in the login response). */
export function signTempToken(payload: Omit<PreAuthPayload, "scope">): string {
  return jwt.sign({ ...payload, scope: "mfa-challenge" }, JWT_SECRET, {
    expiresIn: MFA_CHALLENGE_EXPIRES_IN,
  });
}

/** Verifies a `tempToken`. Throws if invalid, expired, or not an MFA challenge token. */
export function verifyTempToken(token: string): PreAuthPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as PreAuthPayload;
  if (decoded.scope !== "mfa-challenge") {
    throw new Error("Token is not an MFA challenge token");
  }
  return decoded;
}

// ── Middleware ────────────────────────────────────────────────────────────────

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers["authorization"];
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = verifyToken(token);
    const viewAs = req.headers["x-view-as-tenant"];
    const canViewAs = payload.role === "super_admin" || payload.role === "admin" || payload.role === "ciso";
    if (viewAs && typeof viewAs === "string" && canViewAs) {
      const n = parseInt(viewAs, 10);
      if (!isNaN(n) && n > 0) payload.tenantId = n;
    }
    (req as Request & { user: JwtPayload }).user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Middleware factory — restricts access to users with one of the specified roles. */
export function requireRole(...roles: string[]) {
  return function(req: Request, res: Response, next: NextFunction): void {
    const user = (req as Request & { user?: JwtPayload }).user;
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (!roles.includes(user.role)) { res.status(403).json({ error: "Forbidden — insufficient role" }); return; }
    next();
  };
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers["authorization"];
  if (header?.startsWith("Bearer ")) {
    try {
      const payload = verifyToken(header.slice(7));
      (req as Request & { user?: JwtPayload }).user = payload;
    } catch {
      // ignore
    }
  }
  next();
}
