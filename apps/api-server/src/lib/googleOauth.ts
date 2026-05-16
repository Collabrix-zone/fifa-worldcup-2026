import { randomBytes } from "node:crypto";
import type { Response } from "express";

export const OAUTH_STATE_COOKIE = "goalrush_oauth_state";
const STATE_TTL_MS = 10 * 60 * 1000;

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export interface GoogleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  given_name?: string;
  picture?: string;
}

function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  return "http://localhost:5173";
}

export function googleRedirectUri(): string {
  return `${appBaseUrl()}/api/auth/google/callback`;
}

export function googleAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not set");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export function newOauthState(): string {
  return randomBytes(24).toString("hex");
}

export function setOauthStateCookie(res: Response, state: string): void {
  const localDev = process.env.NODE_ENV !== "production";
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: !localDev,
    path: "/",
    maxAge: STATE_TTL_MS,
  });
}

export function clearOauthStateCookie(res: Response): void {
  res.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });
}

export async function exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)");
  }
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${tokenRes.status} ${text}`);
  }
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) throw new Error("Google token response missing access_token");

  const userRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!userRes.ok) {
    const text = await userRes.text();
    throw new Error(`Google userinfo fetch failed: ${userRes.status} ${text}`);
  }
  const profile = (await userRes.json()) as GoogleProfile;
  if (!profile.sub || !profile.email) {
    throw new Error("Google profile missing sub or email");
  }
  return profile;
}
