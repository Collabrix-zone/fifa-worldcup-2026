import { Router, type IRouter } from "express";
import { eq, and, asc, inArray, lte, ne } from "drizzle-orm";
import {
  db,
  tournamentsTable,
  matchesTable,
  teamsTable,
  predictionsTable,
} from "@workspace/db";
import {
  Match,
  MatchInput,
  MatchUpdate,
  MatchResultInput,
  MatchWithPrediction,
  MatchLineups,
  CsvImportInput,
  ImportSummary,
} from "../lib/contracts";
import { requireAdmin, requireAuth } from "../middlewares/auth";
import { fetchMatchDetails, type FdLineupPlayer } from "../lib/footballData";
import { sendResultEmailForMatch, sendNewMatchesDigest } from "../lib/notifications";
import { serializeMatch, serializeMatchWithPrediction, isLockedNow, effectiveStatus } from "../lib/matchSerializer";
import { calculatePredictionPoints } from "../lib/scoring";
import { importMatchesFromCsv } from "../lib/csvImport";
import { enforceLockInvariant } from "../lib/lockTime";

const router: IRouter = Router();

async function teamMap(ids: number[]) {
  if (ids.length === 0) return new Map<number, typeof teamsTable.$inferSelect>();
  const rows = await db.select().from(teamsTable).where(inArray(teamsTable.id, ids));
  return new Map(rows.map((t) => [t.id, t]));
}

async function loadMatchOr404(id: number) {
  const [m] = await db.select().from(matchesTable).where(eq(matchesTable.id, id));
  return m ?? null;
}

// Lineups don't change much once announced (~1h before kickoff), so a 1h
// per-match cache keeps us well under the 10 req/min free tier.
const LINEUPS_TTL_MS = 60 * 60 * 1000;
interface LineupsCacheEntry {
  fetchedAt: number;
  payload: ReturnType<typeof MatchLineups.parse>;
}
const lineupsCache = new Map<number, LineupsCacheEntry>();

function normalizeLineupPlayers(players: FdLineupPlayer[] | undefined) {
  return (players ?? []).map((p) => ({
    name: p.name,
    position: p.position ?? null,
    shirtNumber: p.shirtNumber ?? null,
  }));
}

router.get("/tournaments/:slug/matches", async (req, res): Promise<void> => {
  const slug = String(req.params.slug);
  const statusFilter = typeof req.query.status === "string" ? req.query.status : "all";

  const [t] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.slug, slug));
  if (!t) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }

  const allMatches = await db
    .select()
    .from(matchesTable)
    .where(eq(matchesTable.tournamentId, t.id))
    .orderBy(asc(matchesTable.kickoffTime));

  // Apply effective status filter
  const filtered = allMatches.filter((m) => {
    if (statusFilter === "all") return true;
    return effectiveStatus(m) === statusFilter;
  });

  const teamIds = Array.from(new Set(filtered.flatMap((m) => [m.teamAId, m.teamBId])));
  const teams = await teamMap(teamIds);

  let myPredictions = new Map<number, typeof predictionsTable.$inferSelect>();
  if (req.user && filtered.length > 0) {
    const matchIds = filtered.map((m) => m.id);
    const preds = await db
      .select()
      .from(predictionsTable)
      .where(and(eq(predictionsTable.userId, req.user.id), inArray(predictionsTable.matchId, matchIds)));
    myPredictions = new Map(preds.map((p) => [p.matchId, p]));
  }

  const out = filtered.map((m) =>
    MatchWithPrediction.parse(
      serializeMatchWithPrediction(
        m,
        teams.get(m.teamAId)!,
        teams.get(m.teamBId)!,
        myPredictions.get(m.id) ?? null,
      ),
    ),
  );
  res.json(out);
});

router.post("/tournaments/:slug/matches", requireAdmin, async (req, res): Promise<void> => {
  const slug = String(req.params.slug);
  const parsed = MatchInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [t] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.slug, slug));
  if (!t) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }

  const [m] = await db
    .insert(matchesTable)
    .values({
      tournamentId: t.id,
      round: parsed.data.round ?? "Group Stage",
      group: parsed.data.group ?? "",
      teamAId: parsed.data.teamAId,
      teamBId: parsed.data.teamBId,
      kickoffTime: parsed.data.kickoffTime,
      lockTime: enforceLockInvariant(parsed.data.kickoffTime, parsed.data.lockTime),
      status: parsed.data.status ?? "open",
    })
    .returning();

  const teams = await teamMap([m.teamAId, m.teamBId]);
  res.status(201).json(Match.parse(serializeMatch(m, teams.get(m.teamAId)!, teams.get(m.teamBId)!)));
});

router.patch("/matches/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = MatchUpdate.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // If kickoff or lock time is being updated, re-apply the 15-min invariant.
  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.kickoffTime || parsed.data.lockTime) {
    const [existing] = await db.select().from(matchesTable).where(eq(matchesTable.id, id));
    if (existing) {
      const kickoff = parsed.data.kickoffTime ?? existing.kickoffTime;
      const lock = parsed.data.lockTime ?? existing.lockTime;
      updates.lockTime = enforceLockInvariant(kickoff, lock);
    }
  }

  const [m] = await db
    .update(matchesTable)
    .set(updates)
    .where(eq(matchesTable.id, id))
    .returning();
  if (!m) {
    res.status(404).json({ error: "Match not found" });
    return;
  }
  const teams = await teamMap([m.teamAId, m.teamBId]);
  res.json(Match.parse(serializeMatch(m, teams.get(m.teamAId)!, teams.get(m.teamBId)!)));
});

router.delete("/matches/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [m] = await db.delete(matchesTable).where(eq(matchesTable.id, id)).returning();
  if (!m) {
    res.status(404).json({ error: "Match not found" });
    return;
  }
  res.status(204).send();
});

async function rescoreMatch(match: typeof matchesTable.$inferSelect) {
  const allPreds = await db.select().from(predictionsTable).where(eq(predictionsTable.matchId, match.id));
  for (const p of allPreds) {
    const s = calculatePredictionPoints(p, match);
    await db
      .update(predictionsTable)
      .set({ points: s.points, resultLabel: s.label, status: "scored" })
      .where(eq(predictionsTable.id, p.id));
  }
}

router.post("/matches/:id/result", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = MatchResultInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [m] = await db
    .update(matchesTable)
    .set({ scoreA: parsed.data.scoreA, scoreB: parsed.data.scoreB, status: "completed" })
    .where(eq(matchesTable.id, id))
    .returning();
  if (!m) {
    res.status(404).json({ error: "Match not found" });
    return;
  }

  await rescoreMatch(m);

  void sendResultEmailForMatch(m.id).catch((err) => {
    req.log.warn({ err, matchId: m.id }, "result email failed");
  });

  const teams = await teamMap([m.teamAId, m.teamBId]);
  res.json(Match.parse(serializeMatch(m, teams.get(m.teamAId)!, teams.get(m.teamBId)!)));
});

router.post("/matches/:id/recalculate", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const m = await loadMatchOr404(id);
  if (!m) {
    res.status(404).json({ error: "Match not found" });
    return;
  }
  if (m.scoreA == null || m.scoreB == null) {
    res.status(400).json({ error: "Match has no result yet" });
    return;
  }
  await rescoreMatch(m);
  const teams = await teamMap([m.teamAId, m.teamBId]);
  res.json(Match.parse(serializeMatch(m, teams.get(m.teamAId)!, teams.get(m.teamBId)!)));
});

router.post("/tournaments/:slug/matches/import", requireAdmin, async (req, res): Promise<void> => {
  const slug = String(req.params.slug);
  const parsed = CsvImportInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [t] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.slug, slug));
  if (!t) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }

  const summary = await importMatchesFromCsv(parsed.data.csv, t.id, req.log);
  if (summary.matchesCreated > 0) {
    void sendNewMatchesDigest(slug).catch((err) => {
      req.log.warn({ err }, "new-matches digest failed (CSV import)");
    });
  }
  res.json(ImportSummary.parse(summary));
});

// Auto-lock matches whose lockTime has passed but are still "open"
// (kept simple: invoked indirectly via effectiveStatus on reads).
// Avoid unused imports
void lte;
void ne;

router.get("/matches/:id/lineups", requireAuth, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid match id" });
    return;
  }
  const m = await loadMatchOr404(id);
  if (!m) {
    res.status(404).json({ error: "Match not found" });
    return;
  }

  // Resolve our team IDs so the frontend can join lineups back to local teams.
  const teamRows = await teamMap([m.teamAId, m.teamBId]);
  const teamA = teamRows.get(m.teamAId);
  const teamB = teamRows.get(m.teamBId);
  if (!teamA || !teamB) {
    res.status(500).json({ error: "Match teams missing" });
    return;
  }

  const emptyPayload = (reason: string) =>
    MatchLineups.parse({
      matchId: m.id,
      provider: "football-data.org",
      cachedAt: null,
      unavailableReason: reason,
      home: {
        teamId: teamA.id,
        teamName: teamA.name,
        formation: null,
        coach: null,
        lineup: [],
        bench: [],
      },
      away: {
        teamId: teamB.id,
        teamName: teamB.name,
        formation: null,
        coach: null,
        lineup: [],
        bench: [],
      },
    });

  if (m.footballDataMatchId == null) {
    res.json(emptyPayload("Match is not linked to football-data.org yet."));
    return;
  }

  const cached = lineupsCache.get(m.footballDataMatchId);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < LINEUPS_TTL_MS) {
    res.json(cached.payload);
    return;
  }

  let detail;
  try {
    detail = await fetchMatchDetails(m.footballDataMatchId);
  } catch (err) {
    if (cached) {
      req.log.warn({ err }, "lineups fetch failed; serving stale cache");
      res.json(cached.payload);
      return;
    }
    res.json(emptyPayload((err as Error).message));
    return;
  }

  const homeFd = detail.homeTeam;
  const awayFd = detail.awayTeam;
  // football-data sometimes returns the teams in opposite order from what we
  // store. Match by FD team id when we have one, fall back to position.
  const aIsHome = teamA.footballDataTeamId === homeFd?.id || teamB.footballDataTeamId !== homeFd?.id;
  const ourHomeFd = aIsHome ? homeFd : awayFd;
  const ourAwayFd = aIsHome ? awayFd : homeFd;

  const payload = MatchLineups.parse({
    matchId: m.id,
    provider: "football-data.org",
    cachedAt: new Date(now).toISOString(),
    unavailableReason:
      (ourHomeFd?.lineup?.length ?? 0) === 0 && (ourAwayFd?.lineup?.length ?? 0) === 0
        ? "Lineups have not been announced yet."
        : null,
    home: {
      teamId: teamA.id,
      teamName: teamA.name,
      formation: ourHomeFd?.formation ?? null,
      coach: ourHomeFd?.coach?.name ?? null,
      lineup: normalizeLineupPlayers(ourHomeFd?.lineup),
      bench: normalizeLineupPlayers(ourHomeFd?.bench),
    },
    away: {
      teamId: teamB.id,
      teamName: teamB.name,
      formation: ourAwayFd?.formation ?? null,
      coach: ourAwayFd?.coach?.name ?? null,
      lineup: normalizeLineupPlayers(ourAwayFd?.lineup),
      bench: normalizeLineupPlayers(ourAwayFd?.bench),
    },
  });

  lineupsCache.set(m.footballDataMatchId, { fetchedAt: now, payload });
  res.json(payload);
});

export default router;
