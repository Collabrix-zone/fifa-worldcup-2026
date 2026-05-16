import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, matchesTable, predictionsTable, participantsTable } from "@workspace/db";
import { PredictionInput, Prediction } from "../lib/contracts";
import { requireAuth } from "../middlewares/auth";
import { isLockedNow } from "../lib/matchSerializer";
import { serializePrediction } from "../lib/matchSerializer";
import { calculatePredictionPoints } from "../lib/scoring";

const router: IRouter = Router();

router.post("/matches/:id/predict", requireAuth, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = PredictionInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.user!.id;

  // Admins don't play. Hard-block at the API so a forged request from an
  // admin session still can't poison the leaderboard.
  if (req.user!.role === "admin") {
    res.status(403).json({
      error: "Admins do not submit predictions.",
      code: "ADMIN_NO_PREDICT",
    });
    return;
  }

  // Honor-system entry-fee gate: predictions are only allowed once the user's
  // payment is approved by an admin. Browsing endpoints stay open to everyone.
  const { usersTable } = await import("@workspace/db");
  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!me || me.paymentStatus !== "paid") {
    res.status(402).json({
      error: "Entry fee required to submit predictions.",
      code: "PAYMENT_REQUIRED",
      paymentStatus: me?.paymentStatus ?? "unpaid",
    });
    return;
  }

  const [m] = await db.select().from(matchesTable).where(eq(matchesTable.id, id));
  if (!m) {
    res.status(404).json({ error: "Match not found" });
    return;
  }
  if (isLockedNow(m)) {
    res.status(403).json({ error: "Predictions are locked for this match." });
    return;
  }

  // Participation check
  const [participant] = await db
    .select()
    .from(participantsTable)
    .where(and(eq(participantsTable.tournamentId, m.tournamentId), eq(participantsTable.userId, userId)));
  if (!participant) {
    res.status(403).json({ error: "Join the tournament before submitting predictions." });
    return;
  }

  const [existing] = await db
    .select()
    .from(predictionsTable)
    .where(and(eq(predictionsTable.matchId, id), eq(predictionsTable.userId, userId)));

  const data = parsed.data;
  const writeFields = {
    predictedScoreA: data.predictedScoreA,
    predictedScoreB: data.predictedScoreB,
    predictedExtraTimeA: data.predictedExtraTimeA ?? null,
    predictedExtraTimeB: data.predictedExtraTimeB ?? null,
    predictedPenaltiesA: data.predictedPenaltiesA ?? null,
    predictedPenaltiesB: data.predictedPenaltiesB ?? null,
  };

  let saved;
  if (existing) {
    [saved] = await db
      .update(predictionsTable)
      .set(writeFields)
      .where(eq(predictionsTable.id, existing.id))
      .returning();
  } else {
    [saved] = await db
      .insert(predictionsTable)
      .values({
        tournamentId: m.tournamentId,
        matchId: m.id,
        userId,
        ...writeFields,
        status: "submitted",
      })
      .returning();
  }

  // If match was already completed (admin entered a result, edge case), score immediately.
  if (m.status === "completed" && m.scoreA != null && m.scoreB != null) {
    const s = calculatePredictionPoints(saved, m);
    [saved] = await db
      .update(predictionsTable)
      .set({ points: s.points, resultLabel: s.label, status: "scored" })
      .where(eq(predictionsTable.id, saved.id))
      .returning();
  }

  res.json(Prediction.parse(serializePrediction(saved)));
});

export default router;
