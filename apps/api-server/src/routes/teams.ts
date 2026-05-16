import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, teamsTable } from "@workspace/db";
import { Team, TeamInput, TeamForm } from "../lib/contracts";
import { requireAdmin, requireAuth } from "../middlewares/auth";
import { fetchTeamMatches, type FdTeamMatch } from "../lib/footballData";

const router: IRouter = Router();

// Tiny in-memory cache for team form lookups. football-data free tier is
// 10 req/min total, so we cap each team to 1 hit per 30 minutes.
const TEAM_FORM_TTL_MS = 30 * 60 * 1000;
interface TeamFormCacheEntry {
  fetchedAt: number;
  data: FdTeamMatch[];
}
const teamFormCache = new Map<number, TeamFormCacheEntry>();

function summarizeForm(team: { id: number; footballDataTeamId: number }, matches: FdTeamMatch[]) {
  return matches.map((m) => {
    const isHome = m.homeTeam?.id === team.footballDataTeamId;
    const ourSide = isHome ? m.score.fullTime.home : m.score.fullTime.away;
    const theirSide = isHome ? m.score.fullTime.away : m.score.fullTime.home;
    const opponent = isHome ? m.awayTeam : m.homeTeam;
    let result: "W" | "D" | "L" | null = null;
    if (ourSide != null && theirSide != null) {
      if (ourSide > theirSide) result = "W";
      else if (ourSide < theirSide) result = "L";
      else result = "D";
    }
    return {
      utcDate: m.utcDate,
      opponentName: opponent?.name ?? "TBD",
      opponentCode: opponent?.tla ?? null,
      opponentCrest: opponent?.crest ?? null,
      isHome,
      scoreFor: ourSide,
      scoreAgainst: theirSide,
      result,
      competition: m.competition?.name ?? null,
    };
  });
}

router.get("/teams", async (_req, res): Promise<void> => {
  const rows = await db.select().from(teamsTable).orderBy(teamsTable.name);
  res.json(rows.map((t) => Team.parse(t)));
});

router.post("/teams", requireAdmin, async (req, res): Promise<void> => {
  const parsed = TeamInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const name = parsed.data.name.trim();
  const [existing] = await db.select().from(teamsTable).where(eq(teamsTable.name, name));
  if (existing) {
    res.status(409).json({ error: "Team with that name already exists." });
    return;
  }
  const [row] = await db
    .insert(teamsTable)
    .values({
      name,
      code: parsed.data.code.trim().toUpperCase(),
      flag: parsed.data.flag ?? "",
      primaryColor: parsed.data.primaryColor ?? null,
      secondaryColor: parsed.data.secondaryColor ?? null,
    })
    .returning();
  res.status(201).json(Team.parse(row));
});

router.get("/teams/:id/form", requireAuth, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid team id" });
    return;
  }
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, id));
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }

  // Team isn't linked to football-data — surface an empty payload so the UI
  // can render a friendly fallback instead of erroring.
  if (team.footballDataTeamId == null) {
    res.json(
      TeamForm.parse({
        teamId: team.id,
        teamName: team.name,
        provider: "football-data.org",
        cachedAt: null,
        unavailableReason: "Team is not linked to football-data.org",
        recent: [],
      }),
    );
    return;
  }

  const fdId = team.footballDataTeamId;
  const cached = teamFormCache.get(fdId);
  const now = Date.now();
  let matches: FdTeamMatch[];
  let cachedAt: number;
  if (cached && now - cached.fetchedAt < TEAM_FORM_TTL_MS) {
    matches = cached.data;
    cachedAt = cached.fetchedAt;
  } else {
    try {
      matches = await fetchTeamMatches(fdId, 5);
      cachedAt = now;
      teamFormCache.set(fdId, { fetchedAt: cachedAt, data: matches });
    } catch (err) {
      // On a fetch error, fall back to whatever cached value we have so the
      // UI keeps working through transient upstream blips.
      if (cached) {
        matches = cached.data;
        cachedAt = cached.fetchedAt;
        req.log.warn({ err }, "team form fetch failed; serving stale cache");
      } else {
        res.json(
          TeamForm.parse({
            teamId: team.id,
            teamName: team.name,
            provider: "football-data.org",
            cachedAt: null,
            unavailableReason: (err as Error).message,
            recent: [],
          }),
        );
        return;
      }
    }
  }

  res.json(
    TeamForm.parse({
      teamId: team.id,
      teamName: team.name,
      provider: "football-data.org",
      cachedAt: new Date(cachedAt).toISOString(),
      unavailableReason: null,
      recent: summarizeForm({ id: team.id, footballDataTeamId: fdId }, matches),
    }),
  );
});

export default router;
