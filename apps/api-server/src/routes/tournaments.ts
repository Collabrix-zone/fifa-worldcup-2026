import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, tournamentsTable, participantsTable } from "@workspace/db";
import { Tournament, TournamentDetail, Participant } from "../lib/contracts";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/tournaments", async (_req, res): Promise<void> => {
  const rows = await db.select().from(tournamentsTable);
  res.json(rows.map((t) => Tournament.parse(t)));
});

router.get("/tournaments/:slug", async (req, res): Promise<void> => {
  const slug = String(req.params.slug);
  const [t] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.slug, slug));
  if (!t) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }

  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(participantsTable)
    .where(eq(participantsTable.tournamentId, t.id));

  let isParticipant = false;
  if (req.user) {
    const [p] = await db
      .select({ id: participantsTable.id })
      .from(participantsTable)
      .where(and(eq(participantsTable.tournamentId, t.id), eq(participantsTable.userId, req.user.id)));
    isParticipant = !!p;
  }

  res.json(
    TournamentDetail.parse({
      ...t,
      isParticipant,
      participantCount: count,
    }),
  );
});

router.post("/tournaments/:slug/join", requireAuth, async (req, res): Promise<void> => {
  const slug = String(req.params.slug);
  const userId = req.user!.id;

  const [t] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.slug, slug));
  if (!t) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }

  const [existing] = await db
    .select()
    .from(participantsTable)
    .where(and(eq(participantsTable.tournamentId, t.id), eq(participantsTable.userId, userId)));
  if (existing) {
    res.json(Participant.parse(existing));
    return;
  }

  const [p] = await db
    .insert(participantsTable)
    .values({
      tournamentId: t.id,
      userId,
      displayName: req.user!.name,
      status: "active",
    })
    .returning();

  res.json(Participant.parse(p));
});

export default router;
