import { Router, type IRouter } from "express";
import { eq, and, sql, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  predictionsTable,
  matchesTable,
  participantsTable,
  paymentSettingsTable,
} from "@workspace/db";
import {
  ProfileUpdate,
  AuthUser,
  UserStats,
  AccountStatus,
  PaymentSettings,
  SubmitAvatarInput,
  SubmitPaymentInput,
  SubmitIdentityInput,
} from "../lib/contracts";
import { requireAuth } from "../middlewares/auth";
import { computeLeaderboard, tournamentBySlug } from "../lib/leaderboard";
import { effectiveStatus } from "../lib/matchSerializer";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

router.patch("/me/profile", requireAuth, async (req, res): Promise<void> => {
  const parsed = ProfileUpdate.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: { name?: string; displayNameLockedAt?: Date } = {};
  if (parsed.data.name) updates.name = parsed.data.name.trim();
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No updates provided" });
    return;
  }
  // Display name is locked after the user sets it for the first time.
  // Admins can override via /admin/users/:id/name; the user cannot change
  // their own name again once stamped.
  if (updates.name) {
    const [existing] = await db
      .select({ displayNameLockedAt: usersTable.displayNameLockedAt })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.id));
    if (existing?.displayNameLockedAt) {
      res.status(403).json({
        error: "Display name is locked. Contact an admin to change it.",
        code: "NAME_LOCKED",
      });
      return;
    }
    updates.displayNameLockedAt = new Date();
  }
  const [u] = await db.update(usersTable).set(updates).where(eq(usersTable.id, req.user!.id)).returning();
  // Also update participant displayName for joined tournaments
  if (updates.name) {
    await db
      .update(participantsTable)
      .set({ displayName: updates.name })
      .where(eq(participantsTable.userId, req.user!.id));
  }
  res.json(
    AuthUser.parse({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
    }),
  );
});

router.get("/me/stats", requireAuth, async (req, res): Promise<void> => {
  const slug = String(req.query.tournamentSlug ?? "");
  const t = await tournamentBySlug(slug);
  if (!t) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }

  const userId = req.user!.id;
  const [participant] = await db
    .select()
    .from(participantsTable)
    .where(and(eq(participantsTable.tournamentId, t.id), eq(participantsTable.userId, userId)));
  const isParticipant = !!participant;

  const lb = await computeLeaderboard(t.id, { currentUserId: userId });
  const me = lb.find((e) => e.userId === userId);

  const [{ submitted }] = await db
    .select({ submitted: sql<number>`cast(count(*) as int)` })
    .from(predictionsTable)
    .where(and(eq(predictionsTable.tournamentId, t.id), eq(predictionsTable.userId, userId)));

  const allMatches = await db.select().from(matchesTable).where(eq(matchesTable.tournamentId, t.id));
  const openIds = allMatches.filter((m) => effectiveStatus(m) === "open").map((m) => m.id);
  let predictedOpenCount = 0;
  if (openIds.length > 0) {
    const [{ c }] = await db
      .select({ c: sql<number>`cast(count(*) as int)` })
      .from(predictionsTable)
      .where(
        and(
          eq(predictionsTable.userId, userId),
          inArray(predictionsTable.matchId, openIds),
        ),
      );
    predictedOpenCount = c;
  }
  const pendingPredictions = Math.max(0, openIds.length - predictedOpenCount);

  res.json(
    UserStats.parse({
      rank: me?.rank ?? null,
      totalPoints: me?.totalPoints ?? 0,
      exactScores: me?.exactScores ?? 0,
      correctResults: me?.correctResults ?? 0,
      goalDifferenceHits: me?.goalDifferenceHits ?? 0,
      predictionsSubmitted: submitted,
      pendingPredictions,
      isParticipant,
    }),
  );
});

async function loadPaymentSettingsPublic() {
  const [row] = await db.select().from(paymentSettingsTable).orderBy(paymentSettingsTable.id).limit(1);
  if (row) {
    return {
      upiId: row.upiId,
      upiDisplayName: row.upiDisplayName,
      qrCodeUrl: objectStorage.toPublicUrl(row.qrCodeUrl),
      prizeNote: row.prizeNote ?? null,
      entryFeeAmount: row.entryFeeAmount,
      entryFeeCurrency: row.entryFeeCurrency,
    };
  }
  // Sensible defaults so /payment renders even before an admin saves settings.
  return {
    upiId: "yesfam@upi",
    upiDisplayName: "YesFam India",
    qrCodeUrl: null,
    prizeNote: "Top scorer wins a pizza from YesFam India.",
    entryFeeAmount: 100,
    entryFeeCurrency: "INR",
  };
}

router.get("/me/account-status", requireAuth, async (req, res): Promise<void> => {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
  if (!u) { res.status(404).json({ error: "User not found" }); return; }
  const settings = await loadPaymentSettingsPublic();
  res.json(
    AccountStatus.parse({
      emailVerified: u.emailVerified,
      emailVerificationExpiresAt: u.emailVerificationExpiresAt ?? null,
      paymentStatus: u.paymentStatus,
      paymentScreenshotUrl: objectStorage.toPublicUrl(u.paymentScreenshotUrl),
      paymentSubmittedAt: u.paymentSubmittedAt ?? null,
      paymentNotes: u.paymentNotes ?? null,
      identityStatus: u.identityStatus,
      identityPhotoUrl: objectStorage.toPublicUrl(u.identityPhotoUrl),
      identitySubmittedAt: u.identitySubmittedAt ?? null,
      identityNotes: u.identityNotes ?? null,
      avatarUrl: objectStorage.toPublicUrl(u.avatarUrl),
      canPredict: u.paymentStatus === "paid",
      paymentSettings: settings,
      banned: !!u.banned,
      banReason: u.banReason ?? null,
      displayNameLocked: u.displayNameLockedAt != null,
    }),
  );
});

router.post("/me/avatar", requireAuth, async (req, res): Promise<void> => {
  const parsed = SubmitAvatarInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await db.update(usersTable).set({ avatarUrl: parsed.data.photoUrl }).where(eq(usersTable.id, req.user!.id));
  res.json({ ok: true });
});

router.post("/me/payment", requireAuth, async (req, res): Promise<void> => {
  const parsed = SubmitPaymentInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await db.update(usersTable).set({
    paymentScreenshotUrl: parsed.data.screenshotUrl,
    paymentStatus: "submitted",
    paymentSubmittedAt: new Date(),
    paymentNotes: null,
  }).where(eq(usersTable.id, req.user!.id));
  res.json({ ok: true });
});

router.post("/me/identity", requireAuth, async (req, res): Promise<void> => {
  const parsed = SubmitIdentityInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await db.update(usersTable).set({
    identityPhotoUrl: parsed.data.photoUrl,
    identityStatus: "pending",
    identitySubmittedAt: new Date(),
    identityNotes: null,
  }).where(eq(usersTable.id, req.user!.id));
  res.json({ ok: true });
});

// Re-exported so admin routes can share the public-settings shape lookup.
export { loadPaymentSettingsPublic };
export { PaymentSettings as _PaymentSettings };

export default router;
