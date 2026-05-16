import { Router, type IRouter } from "express";
import { eq, and, sql, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  participantsTable,
  matchesTable,
  predictionsTable,
  teamsTable,
  paymentSettingsTable,
} from "@workspace/db";
import {
  AdminOverview,
  AdminUserRow,
  MatchPredictionSummary,
  PaymentSettings,
  PaymentSettingsInput,
  PendingPayment,
  PendingIdentity,
  AdminDecisionInput,
} from "../lib/contracts";
import { requireAdmin } from "../middlewares/auth";
import { ObjectStorageService } from "../lib/objectStorage";

const objectStorage = new ObjectStorageService();
import { tournamentBySlug } from "../lib/leaderboard";
import { effectiveStatus, isLockedNow } from "../lib/matchSerializer";

const router: IRouter = Router();

router.get("/admin/overview", requireAdmin, async (req, res): Promise<void> => {
  const slug = String(req.query.tournamentSlug ?? "");
  const t = await tournamentBySlug(slug);
  if (!t) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }

  const [{ totalUsers }] = await db
    .select({ totalUsers: sql<number>`cast(count(*) as int)` })
    .from(usersTable);

  const [{ totalParticipants }] = await db
    .select({ totalParticipants: sql<number>`cast(count(*) as int)` })
    .from(participantsTable)
    .where(eq(participantsTable.tournamentId, t.id));

  const matches = await db.select().from(matchesTable).where(eq(matchesTable.tournamentId, t.id));
  const totalMatches = matches.length;
  let openMatches = 0;
  let lockedMatches = 0;
  let completedMatches = 0;
  for (const m of matches) {
    const s = effectiveStatus(m);
    if (s === "open") openMatches++;
    else if (s === "locked") lockedMatches++;
    else completedMatches++;
  }

  const [{ totalPredictions }] = await db
    .select({ totalPredictions: sql<number>`cast(count(*) as int)` })
    .from(predictionsTable)
    .where(eq(predictionsTable.tournamentId, t.id));

  // Missing predictions = (participants × matches that are locked-or-completed) - predictions on those matches
  const lockedOrCompleted = matches.filter((m) => effectiveStatus(m) !== "open");
  const expected = totalParticipants * lockedOrCompleted.length;
  let actual = 0;
  if (lockedOrCompleted.length > 0) {
    const ids = lockedOrCompleted.map((m) => m.id);
    const [{ c }] = await db
      .select({ c: sql<number>`cast(count(*) as int)` })
      .from(predictionsTable)
      .where(and(eq(predictionsTable.tournamentId, t.id), inArray(predictionsTable.matchId, ids)));
    actual = c;
  }
  const missingPredictions = Math.max(0, expected - actual);

  res.json(
    AdminOverview.parse({
      totalUsers,
      totalParticipants,
      totalMatches,
      openMatches,
      lockedMatches,
      completedMatches,
      totalPredictions,
      missingPredictions,
    }),
  );
});

router.get("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  const slug = String(req.query.tournamentSlug ?? "");
  const t = await tournamentBySlug(slug);
  if (!t) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }

  // Pull every user, then layer on participation + activity for the given
  // tournament. Single round-trip per table; aggregation done in memory because
  // the user count is small (tens, not thousands).
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);

  const participants = await db
    .select({ userId: participantsTable.userId })
    .from(participantsTable)
    .where(eq(participantsTable.tournamentId, t.id));
  const participantIds = new Set(participants.map((p) => p.userId));

  const predRows = await db
    .select({
      userId: predictionsTable.userId,
      points: predictionsTable.points,
    })
    .from(predictionsTable)
    .where(eq(predictionsTable.tournamentId, t.id));

  const stats = new Map<number, { count: number; points: number }>();
  for (const p of predRows) {
    const cur = stats.get(p.userId) ?? { count: 0, points: 0 };
    cur.count += 1;
    cur.points += Number(p.points ?? 0);
    stats.set(p.userId, cur);
  }

  const out = users.map((u) => {
    const s = stats.get(u.id);
    return AdminUserRow.parse({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
      isParticipant: participantIds.has(u.id),
      predictionsSubmitted: s?.count ?? 0,
      totalPoints: s?.points ?? 0,
      banned: !!u.banned,
      banReason: u.banReason ?? null,
    });
  });

  res.json(out);
});

router.get("/admin/predictions", requireAdmin, async (req, res): Promise<void> => {
  const slug = String(req.query.tournamentSlug ?? "");
  const t = await tournamentBySlug(slug);
  if (!t) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }

  const matches = await db
    .select({
      id: matchesTable.id,
      kickoffTime: matchesTable.kickoffTime,
      lockTime: matchesTable.lockTime,
      status: matchesTable.status,
      teamACode: teamsTable.code,
    })
    .from(matchesTable)
    .innerJoin(teamsTable, eq(teamsTable.id, matchesTable.teamAId))
    .where(eq(matchesTable.tournamentId, t.id))
    .orderBy(matchesTable.kickoffTime);

  // Need teamB code too — second pass.
  const allMatches = await db.select().from(matchesTable).where(eq(matchesTable.tournamentId, t.id));
  const teamRows = await db.select().from(teamsTable);
  const teamById = new Map(teamRows.map((t) => [t.id, t]));

  const [{ pCount }] = await db
    .select({ pCount: sql<number>`cast(count(*) as int)` })
    .from(participantsTable)
    .where(eq(participantsTable.tournamentId, t.id));

  const out = await Promise.all(
    allMatches.map(async (m) => {
      const [{ c }] = await db
        .select({ c: sql<number>`cast(count(*) as int)` })
        .from(predictionsTable)
        .where(eq(predictionsTable.matchId, m.id));
      const teamA = teamById.get(m.teamAId);
      const teamB = teamById.get(m.teamBId);
      return MatchPredictionSummary.parse({
        matchId: m.id,
        label: `${teamA?.code ?? "?"} vs ${teamB?.code ?? "?"}`,
        kickoffTime: m.kickoffTime,
        status: effectiveStatus(m),
        predictionsCount: c,
        missingCount: Math.max(0, pCount - c),
        isLocked: isLockedNow(m),
      });
    }),
  );

  // Avoid unused
  void matches;

  res.json(out);
});

// ---------- Payment settings (singleton row id=1) ----------

async function loadOrInitSettings(actorUserId: number) {
  const [row] = await db.select().from(paymentSettingsTable).orderBy(paymentSettingsTable.id).limit(1);
  if (row) return row;
  const [created] = await db.insert(paymentSettingsTable).values({
    upiId: "yesfam@upi",
    upiDisplayName: "YesFam India",
    prizeNote: "Top scorer wins a pizza from YesFam India.",
    entryFeeAmount: 100,
    entryFeeCurrency: "INR",
    updatedBy: actorUserId,
  }).returning();
  return created;
}

function settingsToContract(row: typeof paymentSettingsTable.$inferSelect) {
  return PaymentSettings.parse({
    upiId: row.upiId,
    upiDisplayName: row.upiDisplayName,
    qrCodeUrl: objectStorage.toPublicUrl(row.qrCodeUrl),
    prizeNote: row.prizeNote ?? null,
    entryFeeAmount: row.entryFeeAmount,
    entryFeeCurrency: row.entryFeeCurrency,
    updatedAt: row.updatedAt,
  });
}

router.get("/admin/payment-settings", requireAdmin, async (req, res): Promise<void> => {
  const row = await loadOrInitSettings(req.user!.id);
  res.json(settingsToContract(row));
});

router.put("/admin/payment-settings", requireAdmin, async (req, res): Promise<void> => {
  const parsed = PaymentSettingsInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const existing = await loadOrInitSettings(req.user!.id);
  const [updated] = await db.update(paymentSettingsTable).set({
    upiId: parsed.data.upiId,
    upiDisplayName: parsed.data.upiDisplayName,
    qrCodeUrl: parsed.data.qrCodeUrl ?? null,
    prizeNote: parsed.data.prizeNote ?? null,
    entryFeeAmount: parsed.data.entryFeeAmount ?? existing.entryFeeAmount,
    entryFeeCurrency: parsed.data.entryFeeCurrency ?? existing.entryFeeCurrency,
    updatedBy: req.user!.id,
  }).where(eq(paymentSettingsTable.id, existing.id)).returning();
  res.json(settingsToContract(updated));
});

// ---------- Pending payment + identity queues ----------

router.get("/admin/pending-payments", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(usersTable).where(eq(usersTable.paymentStatus, "submitted"));
  const out = rows
    .filter((u) => u.paymentScreenshotUrl && u.paymentSubmittedAt)
    .map((u) => PendingPayment.parse({
      userId: u.id,
      name: u.name,
      email: u.email,
      paymentScreenshotUrl: objectStorage.toPublicUrl(u.paymentScreenshotUrl)!,
      paymentSubmittedAt: u.paymentSubmittedAt!,
      paymentNotes: u.paymentNotes ?? null,
    }));
  res.json(out);
});

router.post("/admin/users/:id/payment-decision", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = AdminDecisionInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const newStatus = parsed.data.decision === "approve" ? "paid" : "rejected";
  await db.update(usersTable).set({
    paymentStatus: newStatus,
    paymentReviewedAt: new Date(),
    paymentNotes: parsed.data.notes ?? null,
  }).where(eq(usersTable.id, id));
  res.json({ ok: true });
});

router.get("/admin/pending-identities", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(usersTable).where(eq(usersTable.identityStatus, "pending"));
  const out = rows
    .filter((u) => u.identityPhotoUrl && u.identitySubmittedAt)
    .map((u) => PendingIdentity.parse({
      userId: u.id,
      name: u.name,
      email: u.email,
      identityPhotoUrl: objectStorage.toPublicUrl(u.identityPhotoUrl)!,
      avatarUrl: objectStorage.toPublicUrl(u.avatarUrl),
      identitySubmittedAt: u.identitySubmittedAt!,
      identityNotes: u.identityNotes ?? null,
    }));
  res.json(out);
});

router.post("/admin/users/:id/identity-decision", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = AdminDecisionInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const newStatus = parsed.data.decision === "approve" ? "verified" : "rejected";
  await db.update(usersTable).set({
    identityStatus: newStatus,
    identityReviewedAt: new Date(),
    identityNotes: parsed.data.notes ?? null,
  }).where(eq(usersTable.id, id));
  res.json({ ok: true });
});

router.post("/admin/users/:id/ban", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!reason) { res.status(400).json({ error: "Reason is required" }); return; }
  if (id === req.user!.id) { res.status(400).json({ error: "Cannot ban yourself" }); return; }
  // Don't allow banning other admins to avoid lockout.
  const [target] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (target.role === "admin") { res.status(403).json({ error: "Cannot ban another admin" }); return; }
  await db.update(usersTable).set({
    banned: true,
    banReason: reason.slice(0, 500),
    bannedAt: new Date(),
  }).where(eq(usersTable.id, id));
  res.json({ ok: true });
});

router.post("/admin/users/:id/unban", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.update(usersTable).set({
    banned: false,
    banReason: null,
    bannedAt: null,
  }).where(eq(usersTable.id, id));
  res.json({ ok: true });
});

router.patch("/admin/users/:id/name", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) { res.status(400).json({ error: "Name is required" }); return; }
  if (name.length > 80) { res.status(400).json({ error: "Name too long (max 80 chars)" }); return; }
  await db.update(usersTable).set({
    name,
    // Re-stamp so the user still cannot self-edit afterward.
    displayNameLockedAt: new Date(),
  }).where(eq(usersTable.id, id));
  await db.update(participantsTable).set({ displayName: name }).where(eq(participantsTable.userId, id));
  res.json({ ok: true });
});

export default router;
