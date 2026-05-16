import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db, sessionsTable, usersTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import type { Response } from "express";

export const SESSION_COOKIE = "goalrush_session";
const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function newToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(userId: number): Promise<string> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessionsTable).values({ token, userId, expiresAt });
  return token;
}

export async function destroySession(token: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
}

export async function findUserBySession(token: string) {
  const [row] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      createdAt: usersTable.createdAt,
      banned: usersTable.banned,
      banReason: usersTable.banReason,
      displayNameLockedAt: usersTable.displayNameLockedAt,
    })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(usersTable.id, sessionsTable.userId))
    .where(and(eq(sessionsTable.token, token), gt(sessionsTable.expiresAt, new Date())));
  return row ?? null;
}

export function setSessionCookie(res: Response, token: string): void {
  // Local HTTP development needs lax/insecure cookies. Production uses
  // SameSite=None + Secure so auth works when web and API are served through
  // the deployed HTTPS origin.
  const localDev = process.env.NODE_ENV !== "production";
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: localDev ? "lax" : "none",
    secure: !localDev,
    path: "/",
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}
