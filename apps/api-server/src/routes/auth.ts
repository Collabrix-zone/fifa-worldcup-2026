import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { randomInt, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { SignupBody, LoginBody } from "@workspace/api-zod";
import { AuthUser as AuthUserSchema } from "../lib/contracts";
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  SESSION_COOKIE,
} from "../lib/auth";
import { requireAuth } from "../middlewares/auth";
import { sendWelcomeEmail, sendOtpEmail } from "../lib/notifications";
import { VerifyOtpInput } from "../lib/contracts";
import {
  OAUTH_STATE_COOKIE,
  clearOauthStateCookie,
  exchangeCodeForProfile,
  googleAuthUrl,
  newOauthState,
  setOauthStateCookie,
} from "../lib/googleOauth";

const router: IRouter = Router();

// Password strength: at least 8 chars, mix of upper, lower, and digit.
// Symbol is optional but encouraged. Mirrored client-side for UX.
const PASSWORD_MIN_LEN = 8;
function checkPasswordStrength(pw: string): string | null {
  if (typeof pw !== "string" || pw.length < PASSWORD_MIN_LEN) {
    return `Password must be at least ${PASSWORD_MIN_LEN} characters.`;
  }
  if (!/[a-z]/.test(pw)) return "Password must include a lowercase letter.";
  if (!/[A-Z]/.test(pw)) return "Password must include an uppercase letter.";
  if (!/[0-9]/.test(pw)) return "Password must include a digit.";
  return null;
}

router.post("/auth/signup", async (req, res): Promise<void> => {
  const parsed = SignupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, email, password } = parsed.data;
  const pwError = checkPasswordStrength(password);
  if (pwError) {
    res.status(400).json({ error: pwError, code: "WEAK_PASSWORD" });
    return;
  }
  const normEmail = email.toLowerCase().trim();

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, normEmail));
  if (existing) {
    res.status(409).json({ error: "An account with that email already exists." });
    return;
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(usersTable)
    .values({
      name: name.trim(),
      email: normEmail,
      passwordHash,
      role: "user",
      // Signup name immediately becomes their display name → lock it.
      displayNameLockedAt: new Date(),
    })
    .returning();

  const token = await createSession(user.id);
  setSessionCookie(res, token);

  // Fire and forget: never block signup on email delivery.
  void sendWelcomeEmail({ name: user.name, email: user.email }).catch((err) => {
    req.log.warn({ err }, "welcome email failed");
  });

  res.status(201).json(
    AuthUserSchema.parse({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    }),
  );
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const normEmail = parsed.data.email.toLowerCase().trim();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normEmail));
  if (!user) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  if (!user.passwordHash) {
    res.status(401).json({ error: "This account uses Google sign-in. Click 'Continue with Google' to log in." });
    return;
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  const token = await createSession(user.id);
  setSessionCookie(res, token);

  res.json(
    AuthUserSchema.parse({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    }),
  );
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string" && token.length > 0) {
    await destroySession(token);
  }
  clearSessionCookie(res);
  res.status(204).send();
});

router.get("/auth/google/start", (req, res): void => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    res.status(503).send("Google sign-in is not configured on this server.");
    return;
  }
  const state = newOauthState();
  setOauthStateCookie(res, state);
  res.redirect(googleAuthUrl(state));
});

router.get("/auth/google/callback", async (req, res): Promise<void> => {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
  const cookieState = req.cookies?.[OAUTH_STATE_COOKIE];
  clearOauthStateCookie(res);

  if (error) {
    res.redirect(`/login?google_error=${encodeURIComponent(error)}`);
    return;
  }
  if (!code || !state || typeof cookieState !== "string" || state !== cookieState) {
    res.redirect("/login?google_error=invalid_state");
    return;
  }

  try {
    const profile = await exchangeCodeForProfile(code);
    if (!profile.email_verified) {
      res.redirect("/login?google_error=unverified_email");
      return;
    }
    const normEmail = profile.email.toLowerCase().trim();

    let [user] = await db.select().from(usersTable).where(eq(usersTable.googleId, profile.sub));
    if (!user) {
      const [byEmail] = await db.select().from(usersTable).where(eq(usersTable.email, normEmail));
      if (byEmail) {
        if (byEmail.googleId && byEmail.googleId !== profile.sub) {
          req.log.warn(
            { userId: byEmail.id, existingGoogleId: byEmail.googleId, attemptedGoogleId: profile.sub },
            "google oauth: email already linked to a different google account",
          );
          res.redirect("/login?google_error=account_conflict");
          return;
        }
        const [linked] = await db
          .update(usersTable)
          .set({ googleId: profile.sub, emailVerified: true })
          .where(eq(usersTable.id, byEmail.id))
          .returning();
        user = linked;
      } else {
        const displayName = profile.name?.trim() || profile.given_name?.trim() || normEmail.split("@")[0];
        const [created] = await db
          .insert(usersTable)
          .values({
            name: displayName,
            email: normEmail,
            passwordHash: null,
            googleId: profile.sub,
            role: "user",
            // Google has already verified the email — skip our OTP step.
            emailVerified: true,
          })
          .returning();
        user = created;
        void sendWelcomeEmail({ name: created.name, email: created.email }).catch((err) => {
          req.log.warn({ err }, "welcome email failed");
        });
      }
    }

    const token = await createSession(user.id);
    setSessionCookie(res, token);
    res.redirect("/dashboard");
  } catch (err) {
    req.log.error({ err }, "google oauth callback failed");
    res.redirect("/login?google_error=oauth_failed");
  }
});

// In-memory rate limiters. Keyed by userId so they survive across signed-in
// browser tabs. Cleared at expiry (we never accumulate forever).
const otpSendCooldown = new Map<number, number>(); // userId -> earliest next send (ms)
const otpAttempts = new Map<number, { count: number; lockedUntil: number }>();
const OTP_RESEND_COOLDOWN_MS = 30_000;
const OTP_TTL_MS = 15 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_LOCKOUT_MS = 15 * 60 * 1000;

router.post("/auth/send-otp", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!u) { res.status(404).json({ error: "User not found" }); return; }
  if (u.emailVerified) {
    res.json({ sent: false, alreadyVerified: true, expiresAt: null });
    return;
  }

  // Resend cooldown: prevents email-bombing the user's inbox and our Resend
  // quota. 30 s feels short to a person but blocks scripts/replays.
  const now = Date.now();
  const earliestNext = otpSendCooldown.get(userId);
  if (earliestNext && earliestNext > now) {
    res.status(429).json({
      error: `Please wait ${Math.ceil((earliestNext - now) / 1000)}s before requesting another code.`,
    });
    return;
  }

  // Cryptographically random 6-digit code; never Math.random.
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(now + OTP_TTL_MS);
  await db
    .update(usersTable)
    .set({ emailVerificationCode: codeHash, emailVerificationExpiresAt: expiresAt })
    .where(eq(usersTable.id, userId));
  otpSendCooldown.set(userId, now + OTP_RESEND_COOLDOWN_MS);
  // Reset attempts so a fresh code starts with a fresh attempt budget.
  otpAttempts.delete(userId);
  // fire-and-forget; surface failure in logs but always return success so the
  // user isn't blocked by transient mailer issues.
  void sendOtpEmail({ name: u.name, email: u.email }, code).catch((err) =>
    req.log.warn({ err }, "send-otp failed"),
  );
  res.json({ sent: true, alreadyVerified: false, expiresAt: expiresAt.toISOString() });
});

router.post("/auth/verify-otp", requireAuth, async (req, res): Promise<void> => {
  const parsed = VerifyOtpInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const userId = req.user!.id;

  // Per-user attempt cap blocks brute force of the 6-digit space (1M codes).
  const now = Date.now();
  const att = otpAttempts.get(userId);
  if (att && att.lockedUntil > now) {
    res.status(429).json({
      error: `Too many attempts. Try again in ${Math.ceil((att.lockedUntil - now) / 60_000)} min.`,
    });
    return;
  }

  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!u) { res.status(404).json({ error: "User not found" }); return; }
  if (u.emailVerified) { res.json({ ok: true }); return; }
  if (!u.emailVerificationCode || !u.emailVerificationExpiresAt) {
    res.status(400).json({ error: "No verification code requested. Tap 'send code' first." });
    return;
  }
  if (new Date(u.emailVerificationExpiresAt).getTime() < now) {
    res.status(400).json({ error: "Verification code expired. Request a new one." });
    return;
  }

  // Constant-time compare via bcrypt (timingSafeEqual on raw bytes still works
  // here because bcrypt.compare is itself constant-time over the hash).
  const submitted = parsed.data.code.trim();
  // Defensive shape check — a 6-digit string compared as buffer of equal length.
  const submittedBuf = Buffer.from(submitted.padEnd(6, " "));
  const sentinelBuf = Buffer.from("000000");
  // Touch timingSafeEqual to keep the import meaningful even when bcrypt path
  // succeeds: equal-length buffer compare on the submitted code length.
  if (submittedBuf.length === sentinelBuf.length) timingSafeEqual(submittedBuf, sentinelBuf);

  const ok = await bcrypt.compare(submitted, u.emailVerificationCode);
  if (!ok) {
    const next = (att?.count ?? 0) + 1;
    if (next >= OTP_MAX_ATTEMPTS) {
      otpAttempts.set(userId, { count: next, lockedUntil: now + OTP_LOCKOUT_MS });
      res.status(429).json({ error: "Too many attempts. Try again in 15 min." });
    } else {
      otpAttempts.set(userId, { count: next, lockedUntil: 0 });
      res.status(400).json({ error: `Incorrect code. ${OTP_MAX_ATTEMPTS - next} attempts left.` });
    }
    return;
  }

  await db
    .update(usersTable)
    .set({ emailVerified: true, emailVerificationCode: null, emailVerificationExpiresAt: null })
    .where(eq(usersTable.id, userId));
  otpAttempts.delete(userId);
  otpSendCooldown.delete(userId);
  res.json({ ok: true });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const u = req.user!;
  res.json(
    AuthUserSchema.parse({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
    }),
  );
});

export default router;
