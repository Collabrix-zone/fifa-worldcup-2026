import type { Request, Response, NextFunction } from "express";
import { SESSION_COOKIE, findUserBySession } from "../lib/auth";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: "user" | "admin";
  createdAt: Date;
  banned: boolean;
  banReason: string | null;
  displayNameLockedAt: Date | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string" && token.length > 0) {
    const user = await findUserBySession(token);
    if (user) {
      req.user = {
        ...user,
        role: user.role as "user" | "admin",
        banned: !!user.banned,
        banReason: user.banReason ?? null,
        displayNameLockedAt: user.displayNameLockedAt ?? null,
      };
    }
  }
  next();
}

// Routes that banned users are still allowed to call. /me lets the UI fetch
// the ban reason to display; /auth/logout lets them sign out.
const BAN_ALLOWLIST = new Set([
  "/api/auth/me",
  "/api/auth/logout",
]);

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (req.user.banned && !BAN_ALLOWLIST.has(req.path) && !BAN_ALLOWLIST.has(req.originalUrl)) {
    res.status(403).json({
      error: "Account banned",
      code: "BANNED",
      reason: req.user.banReason ?? null,
    });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
