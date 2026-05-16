// High-level email senders for Football Kickoff 2026. Each function is designed to be
// called fire-and-forget from a route handler or the background sync loop —
// they swallow errors and only log, so a flaky email provider can never
// break a successful prediction / result write.
//
// Idempotency: result + open-match emails use *atomic claim* via a
// conditional UPDATE that sets `*_EmailSentAt` only when it's still NULL.
// Two concurrent callers can't both claim the same match — Postgres returns
// the row to the first one and an empty set to the second. We deliberately
// stamp regardless of per-recipient send success, trading retries-on-flake
// for guaranteed-no-spam (an outbox table would give us both, but is
// overkill for a single-tournament app with ≤ a few dozen players).
//
// Pre-flight: every public sender checks `isMailerConfigured()` first and
// short-circuits without claiming when Resend isn't connected, so a
// disconnected Resend never permanently suppresses future deliveries.

import { db, usersTable, matchesTable, participantsTable, teamsTable, tournamentsTable } from "@workspace/db";
import { eq, and, isNull, isNotNull, gt, inArray } from "drizzle-orm";
import { logger } from "./logger";
import { sendEmail, isMailerConfigured } from "./mailer";

const APP_NAME = "Football Kickoff 2026";
const COMMUNITY_NAME = "YesFam India";
const MAKER_NAME = "Collabrix Zone";
const MAKER_URL = "https://thecollabrix.com";

let warnedUnconfigured = false;
async function mailerReady(context: string): Promise<boolean> {
  if (await isMailerConfigured()) {
    warnedUnconfigured = false;
    return true;
  }
  if (!warnedUnconfigured) {
    logger.warn({ context }, "Mailer not configured — skipping email notifications until Resend is connected.");
    warnedUnconfigured = true;
  }
  return false;
}

function appUrl(): string {
  const explicit = process.env["APP_BASE_URL"]?.replace(/\/$/, "");
  if (explicit) return explicit;
  return "#";
}

function emailShell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#0b1220;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e5e7eb;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="margin:0 0 4px 0;">
      <span style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#3b82f6;">${COMMUNITY_NAME}</span>
    </div>
    <h1 style="font-size:22px;font-weight:800;margin:0 0 4px 0;color:#ffffff;">${APP_NAME}</h1>
    <p style="margin:0 0 24px 0;color:#94a3b8;font-size:13px;">${title}</p>
    <div style="background:#111827;border:1px solid #1f2937;border-radius:14px;padding:24px;">${bodyHtml}</div>
    <p style="color:#64748b;font-size:11px;margin-top:24px;text-align:center;line-height:1.6;">
      You're getting this because you signed up for ${APP_NAME} — a ${COMMUNITY_NAME} tradition.<br/>
      Built by <a href="${MAKER_URL}" style="color:#94a3b8;text-decoration:underline;">${MAKER_NAME}</a>.
    </p>
  </div>
</body></html>`;
}

function ctaButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#3b82f6;color:#ffffff;padding:12px 22px;border-radius:8px;font-weight:700;text-decoration:none;">${label}</a>`;
}

export async function sendWelcomeEmail(user: { name: string; email: string }): Promise<void> {
  if (!(await mailerReady("welcome"))) return;
  const url = appUrl();
  const html = emailShell(
    "Welcome aboard",
    `<p style="margin:0 0 16px 0;font-size:16px;">Hey <strong>${escape(user.name)}</strong>,</p>
     <p style="margin:0 0 16px 0;line-height:1.55;">Welcome to ${APP_NAME} — the ${COMMUNITY_NAME} prediction tournament. Submit a score before kickoff for every match. Predictions auto-lock 15 minutes before each game.</p>
     <p style="margin:0 0 20px 0;line-height:1.55;"><strong>Scoring:</strong> 7 pts exact score · 5 pts goal difference · 3 pts correct result · 1 pt one team's score · +2/+3 bonuses for ET/penalty calls.</p>
     <p style="margin:24px 0 0 0;text-align:center;">${ctaButton(`${url}/dashboard`, "Make your first prediction")}</p>`,
  );
  const r = await sendEmail({
    to: user.email,
    subject: `Welcome to ${APP_NAME} ⚽`,
    html,
  });
  if (!r.ok && !r.skipped) {
    logger.warn({ to: user.email, reason: r.reason }, "welcome email send failed");
  }
}

interface MatchForEmail {
  id: number;
  round: string;
  group: string;
  kickoffTime: Date;
  lockTime: Date;
  teamAName: string;
  teamAFlag: string;
  teamBName: string;
  teamBFlag: string;
  scoreA: number | null;
  scoreB: number | null;
}

async function loadMatchesForEmail(matchIds: number[]): Promise<MatchForEmail[]> {
  if (matchIds.length === 0) return [];
  const rows = await db
    .select({
      id: matchesTable.id,
      round: matchesTable.round,
      group: matchesTable.group,
      kickoffTime: matchesTable.kickoffTime,
      lockTime: matchesTable.lockTime,
      teamAId: matchesTable.teamAId,
      teamBId: matchesTable.teamBId,
      scoreA: matchesTable.scoreA,
      scoreB: matchesTable.scoreB,
    })
    .from(matchesTable)
    .where(inArray(matchesTable.id, matchIds));
  const teamIds = Array.from(new Set(rows.flatMap((r) => [r.teamAId, r.teamBId])));
  const teams = await db.select().from(teamsTable).where(inArray(teamsTable.id, teamIds));
  const tmap = new Map(teams.map((t) => [t.id, t]));
  return rows.map((r) => {
    const a = tmap.get(r.teamAId);
    const b = tmap.get(r.teamBId);
    return {
      id: r.id,
      round: r.round,
      group: r.group,
      kickoffTime: new Date(r.kickoffTime),
      lockTime: new Date(r.lockTime),
      teamAName: a?.name ?? "?",
      teamAFlag: a?.flag ?? "",
      teamBName: b?.name ?? "?",
      teamBFlag: b?.flag ?? "",
      scoreA: r.scoreA,
      scoreB: r.scoreB,
    };
  });
}

async function tournamentParticipants(tournamentId: number): Promise<{ name: string; email: string }[]> {
  return db
    .select({ name: usersTable.name, email: usersTable.email })
    .from(participantsTable)
    .innerJoin(usersTable, eq(usersTable.id, participantsTable.userId))
    .where(eq(participantsTable.tournamentId, tournamentId));
}

function fmtDate(d: Date): string {
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }) + " UTC";
}

// ---------- New matches digest ----------

// Atomic claim: stamp `openEmailSentAt = now()` for every still-unstamped
// upcoming match in the tournament in a single UPDATE, then send a digest
// to each participant covering exactly those rows. Concurrent callers
// either claim disjoint sets or one claims them all and the other gets [].
export async function sendNewMatchesDigest(tournamentSlug: string): Promise<{ sent: number; matches: number }> {
  if (!(await mailerReady("new-matches-digest"))) return { sent: 0, matches: 0 };

  const [t] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.slug, tournamentSlug));
  if (!t) return { sent: 0, matches: 0 };

  const now = new Date();
  const claimed = await db
    .update(matchesTable)
    .set({ openEmailSentAt: now })
    .where(
      and(
        eq(matchesTable.tournamentId, t.id),
        isNull(matchesTable.openEmailSentAt),
        gt(matchesTable.kickoffTime, now),
      ),
    )
    .returning({ id: matchesTable.id });
  if (claimed.length === 0) return { sent: 0, matches: 0 };

  const matches = await loadMatchesForEmail(claimed.map((c) => c.id));
  matches.sort((a, b) => a.kickoffTime.getTime() - b.kickoffTime.getTime());

  const participants = await tournamentParticipants(t.id);
  if (participants.length === 0) return { sent: 0, matches: matches.length };

  const url = appUrl();
  const list = matches
    .map(
      (m) =>
        `<tr>
          <td style="padding:10px 0;border-bottom:1px solid #1f2937;">
            <div style="font-weight:700;color:#ffffff;">${m.teamAFlag} ${escape(m.teamAName)} vs ${escape(m.teamBName)} ${m.teamBFlag}</div>
            <div style="color:#94a3b8;font-size:12px;margin-top:2px;">${escape(m.group ? `Group ${m.group}` : m.round)} · Kicks off ${fmtDate(m.kickoffTime)} · Locks ${fmtDate(m.lockTime)}</div>
          </td>
        </tr>`,
    )
    .join("");

  let sent = 0;
  for (const u of participants) {
    const html = emailShell(
      "New matches just opened for predictions",
      `<p style="margin:0 0 16px 0;font-size:16px;">Hey <strong>${escape(u.name)}</strong>,</p>
       <p style="margin:0 0 16px 0;line-height:1.55;">${matches.length} new match${matches.length === 1 ? "" : "es"} ${matches.length === 1 ? "is" : "are"} open for predictions. Lock in your scores before kickoff!</p>
       <table style="width:100%;border-collapse:collapse;margin:8px 0 20px 0;">${list}</table>
       <p style="margin:0;text-align:center;">${ctaButton(`${url}/predictions`, "Make your predictions")}</p>`,
    );
    const r = await sendEmail({
      to: u.email,
      subject: `${matches.length} new match${matches.length === 1 ? "" : "es"} open — get your predictions in`,
      html,
    });
    if (r.ok) sent++;
    else if (!r.skipped) {
      logger.warn({ to: u.email, reason: r.reason }, "new-matches digest send failed");
    }
  }

  return { sent, matches: matches.length };
}

// ---------- Result email ----------

// Atomic single-match claim. Returns sent=0 if already claimed (or
// concurrently being claimed) by another caller.
export async function sendResultEmailForMatch(matchId: number): Promise<{ sent: number }> {
  if (!(await mailerReady("result-email"))) return { sent: 0 };

  const claimed = await db
    .update(matchesTable)
    .set({ resultEmailSentAt: new Date() })
    .where(
      and(
        eq(matchesTable.id, matchId),
        isNull(matchesTable.resultEmailSentAt),
        isNotNull(matchesTable.scoreA),
        isNotNull(matchesTable.scoreB),
      ),
    )
    .returning({ id: matchesTable.id });
  if (claimed.length === 0) return { sent: 0 };

  const [m] = await loadMatchesForEmail([matchId]);
  if (!m) return { sent: 0 };

  // Reload tournament id for the participant lookup (loadMatchesForEmail
  // doesn't carry it).
  const [matchRow] = await db
    .select({ tournamentId: matchesTable.tournamentId })
    .from(matchesTable)
    .where(eq(matchesTable.id, matchId));
  if (!matchRow) return { sent: 0 };

  const participants = await tournamentParticipants(matchRow.tournamentId);
  if (participants.length === 0) return { sent: 0 };

  const url = appUrl();
  const scoreLine = `${m.teamAFlag} ${m.teamAName} <strong style="color:#ffffff;">${m.scoreA} – ${m.scoreB}</strong> ${m.teamBName} ${m.teamBFlag}`;

  let sent = 0;
  for (const u of participants) {
    const html = emailShell(
      "Match wrapped up — leaderboard updated",
      `<p style="margin:0 0 16px 0;font-size:16px;">Hey <strong>${escape(u.name)}</strong>,</p>
       <p style="margin:0 0 12px 0;line-height:1.55;">Final score is in:</p>
       <p style="margin:0 0 24px 0;font-size:18px;text-align:center;padding:14px;background:#0b1220;border-radius:10px;">${scoreLine}</p>
       <p style="margin:0 0 20px 0;line-height:1.55;">Predictions have been auto-scored. See where you landed.</p>
       <p style="margin:0;text-align:center;">${ctaButton(`${url}/leaderboard`, "Check the leaderboard")}</p>`,
    );
    const r = await sendEmail({
      to: u.email,
      subject: `${m.teamAName} ${m.scoreA}-${m.scoreB} ${m.teamBName} — leaderboard updated`,
      html,
    });
    if (r.ok) sent++;
    else if (!r.skipped) {
      logger.warn({ to: u.email, reason: r.reason }, "result email send failed");
    }
  }

  return { sent };
}

// Sweep all completed-but-unnotified matches. Safe to call after every
// score sync (manual or background) — does nothing when there's no work.
export async function sendPendingResultEmails(): Promise<{ matches: number; sent: number }> {
  const candidates = await db
    .select({ id: matchesTable.id })
    .from(matchesTable)
    .where(
      and(
        eq(matchesTable.status, "completed"),
        isNotNull(matchesTable.scoreA),
        isNull(matchesTable.resultEmailSentAt),
      ),
    );
  let sent = 0;
  let matches = 0;
  for (const c of candidates) {
    const r = await sendResultEmailForMatch(c.id);
    if (r.sent > 0) {
      matches++;
      sent += r.sent;
    }
  }
  return { matches, sent };
}

// ---------- Email OTP ----------

export async function sendOtpEmail(user: { name: string; email: string }, code: string): Promise<{ ok: boolean; reason?: string }> {
  if (!(await mailerReady("otp-email"))) return { ok: false, reason: "mailer unconfigured" };
  const html = emailShell(
    "Verify your email",
    `<p style="margin:0 0 16px 0;font-size:16px;">Hey <strong>${escape(user.name)}</strong>,</p>
     <p style="margin:0 0 16px 0;line-height:1.55;">Use this 6-digit code to confirm your email for ${APP_NAME}. The code expires in 15 minutes.</p>
     <p style="margin:0 0 16px 0;text-align:center;font-size:34px;font-weight:800;letter-spacing:8px;color:#ffffff;background:#0b1220;padding:18px;border-radius:10px;">${escape(code)}</p>
     <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.55;">If you didn't request this, you can safely ignore the email.</p>`,
  );
  const r = await sendEmail({ to: user.email, subject: `${code} is your ${APP_NAME} verification code`, html });
  if (!r.ok && !r.skipped) {
    logger.warn({ to: user.email, reason: r.reason }, "otp email send failed");
  }
  return { ok: r.ok, reason: r.reason };
}

function escape(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
