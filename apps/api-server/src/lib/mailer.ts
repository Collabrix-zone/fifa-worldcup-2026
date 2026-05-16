// Thin Resend wrapper that gracefully no-ops when email is not configured.
// Production and local development both use RESEND_API_KEY from the runtime
// environment.

import { logger } from "./logger";

const CACHE_TTL_MS = 50 * 60 * 1000;

interface ResendCreds {
  apiKey: string;
  fetchedAt: number;
}
let cached: ResendCreds | null = null;

async function fetchResendCreds(): Promise<ResendCreds | null> {
  const directKey = process.env["RESEND_API_KEY"];
  if (!directKey) return null;
  return {
    apiKey: directKey,
    fetchedAt: Date.now(),
  };
}

async function getCreds(): Promise<ResendCreds | null> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached;
  const fresh = await fetchResendCreds();
  if (fresh) cached = fresh;
  return fresh;
}

// Verified sender on send.thecollabrix.com (DKIM/SPF/DMARC live in Cloudflare).
// Can be overridden at runtime via MAIL_FROM if you ever switch domains.
const VERIFIED_FROM = "Football Kickoff 2026 <noreply@send.thecollabrix.com>";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  id?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const creds = await getCreds();
  if (!creds) {
    return { ok: false, skipped: true, reason: "Resend integration not configured" };
  }
  // Prefer our verified domain over whatever the connector returned (the
  // connector typically defaults to onboarding@resend.dev which is restricted
  // to the Resend account owner). Allow MAIL_FROM env override for portability.
  const from = process.env["MAIL_FROM"] ?? VERIFIED_FROM;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creds.apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn({ status: res.status, body: body.slice(0, 300) }, "resend send failed");
      // Bust the cache so a freshly-rotated token gets picked up next call.
      if (res.status === 401 || res.status === 403) cached = null;
      return { ok: false, reason: `Resend HTTP ${res.status}` };
    }
    const body = (await res.json()) as { id?: string };
    return { ok: true, id: body.id };
  } catch (err) {
    logger.warn({ err }, "resend send threw");
    return { ok: false, reason: (err as Error).message };
  }
}

export async function isMailerConfigured(): Promise<boolean> {
  return (await getCreds()) != null;
}
