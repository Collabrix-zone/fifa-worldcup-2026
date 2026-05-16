// Sync GoalRush fixtures + scores from football-data.org.
//
// Two operations:
//   - syncFixtures: pull schedule, upsert teams + matches, link any existing
//     unlinked matches by name when possible. Idempotent.
//   - syncScores: pull current scores (incl. extra time + penalties), update
//     and — when a match transitions to FINISHED — auto-score all predictions.
//
// All score writes preserve our scoring contract: `scoreA`/`scoreB` always
// reflect the end-of-regulation result (what predictions are scored against).
// ET / penalties are display-only enrichment.

import { db, teamsTable, matchesTable, predictionsTable, syncStatusTable, type MatchRow } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import type { Logger } from "pino";
import { fetchCompetitionMatches, type FdMatch, type FdTeam } from "./footballData";
import { calculatePredictionPoints } from "./scoring";
import { enforceLockInvariant } from "./lockTime";

export interface SyncFixturesResult {
  provider: string;
  competition: string;
  matchesCreated: number;
  matchesUpdated: number;
  teamsCreated: number;
  teamsLinked: number;
  errors: string[];
}

export interface SyncScoresResult {
  provider: string;
  matchesUpdated: number;
  matchesCompleted: number;
  predictionsScored: number;
  errors: string[];
}

const PROVIDER = "football-data.org";

async function recordSyncSuccess(kind: "fixtures" | "scores"): Promise<void> {
  await db
    .insert(syncStatusTable)
    .values({ kind, provider: PROVIDER, lastSuccessAt: new Date() })
    .onConflictDoUpdate({
      target: syncStatusTable.kind,
      set: {
        provider: PROVIDER,
        lastSuccessAt: new Date(),
        updatedAt: new Date(),
      },
    });
}

export async function getLastSyncTimes(): Promise<{ fixturesAt: Date | null; scoresAt: Date | null }> {
  const rows = await db.select().from(syncStatusTable);
  return {
    fixturesAt: rows.find((row) => row.kind === "fixtures")?.lastSuccessAt ?? null,
    scoresAt: rows.find((row) => row.kind === "scores")?.lastSuccessAt ?? null,
  };
}

// Coarse flag emoji map for common WC nations. football-data only gives a
// crest URL; we keep an emoji fallback so the existing UI keeps working.
const FLAG_BY_TLA: Record<string, string> = {
  ARG: "🇦🇷", AUS: "🇦🇺", AUT: "🇦🇹", BEL: "🇧🇪", BRA: "🇧🇷", CAN: "🇨🇦",
  CHI: "🇨🇱", CIV: "🇨🇮", COL: "🇨🇴", CRC: "🇨🇷", CRO: "🇭🇷", DEN: "🇩🇰",
  ECU: "🇪🇨", EGY: "🇪🇬", ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", ESP: "🇪🇸", FRA: "🇫🇷", GER: "🇩🇪",
  GHA: "🇬🇭", IRN: "🇮🇷", ITA: "🇮🇹", JPN: "🇯🇵", KOR: "🇰🇷", MAR: "🇲🇦",
  MEX: "🇲🇽", NED: "🇳🇱", NGA: "🇳🇬", NOR: "🇳🇴", NZL: "🇳🇿", PAR: "🇵🇾",
  POL: "🇵🇱", POR: "🇵🇹", QAT: "🇶🇦", RSA: "🇿🇦", SCO: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", SEN: "🇸🇳",
  SRB: "🇷🇸", SUI: "🇨🇭", SVK: "🇸🇰", SWE: "🇸🇪", TUN: "🇹🇳", URU: "🇺🇾",
  USA: "🇺🇸", UZB: "🇺🇿", WAL: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
};

function flagFor(tla: string | null): string {
  if (!tla) return "";
  return FLAG_BY_TLA[tla.toUpperCase()] ?? "";
}

function makeCode(tla: string | null, name: string): string {
  if (tla) return tla.toUpperCase().slice(0, 5);
  return name.slice(0, 3).toUpperCase();
}

function stageToRound(stage: string, group: string | null): string {
  switch (stage) {
    case "GROUP_STAGE":
      return group ? `Group ${group.replace("GROUP_", "")}` : "Group Stage";
    case "LAST_16":
    case "ROUND_OF_16":
      return "Round of 16";
    case "QUARTER_FINALS":
      return "Quarter-Finals";
    case "SEMI_FINALS":
      return "Semi-Finals";
    case "THIRD_PLACE":
      return "Third-Place Playoff";
    case "FINAL":
      return "Final";
    default:
      return stage.replace(/_/g, " ");
  }
}

function groupCode(group: string | null): string {
  if (!group) return "";
  return group.replace("GROUP_", "");
}

interface UpsertedTeam {
  id: number;
  created: boolean;
  linked: boolean;
}

async function upsertTeam(t: FdTeam): Promise<UpsertedTeam> {
  // 1. Already linked by football-data id?
  const [byId] = await db.select().from(teamsTable).where(eq(teamsTable.footballDataTeamId, t.id));
  if (byId) {
    // Refresh crest if missing
    if (!byId.crestUrl && t.crest) {
      await db.update(teamsTable).set({ crestUrl: t.crest }).where(eq(teamsTable.id, byId.id));
    }
    return { id: byId.id, created: false, linked: false };
  }

  // 2. Match by name (case-insensitive) and link.
  const [byName] = await db
    .select()
    .from(teamsTable)
    .where(sql`lower(${teamsTable.name}) = lower(${t.name})`);
  if (byName) {
    await db
      .update(teamsTable)
      .set({
        footballDataTeamId: t.id,
        crestUrl: byName.crestUrl ?? t.crest,
        flag: byName.flag || flagFor(t.tla),
      })
      .where(eq(teamsTable.id, byName.id));
    return { id: byName.id, created: false, linked: true };
  }

  // 3. Create.
  const [row] = await db
    .insert(teamsTable)
    .values({
      name: t.name,
      code: makeCode(t.tla, t.name),
      flag: flagFor(t.tla),
      crestUrl: t.crest,
      footballDataTeamId: t.id,
    })
    .returning();
  return { id: row.id, created: true, linked: false };
}

export async function syncFixtures(
  tournamentId: number,
  competitionCode = "WC",
  log?: Logger,
): Promise<SyncFixturesResult> {
  const out: SyncFixturesResult = {
    provider: PROVIDER,
    competition: competitionCode,
    matchesCreated: 0,
    matchesUpdated: 0,
    teamsCreated: 0,
    teamsLinked: 0,
    errors: [],
  };

  let fdMatches: FdMatch[];
  try {
    fdMatches = await fetchCompetitionMatches(competitionCode);
  } catch (err) {
    out.errors.push((err as Error).message);
    return out;
  }

  for (const fd of fdMatches) {
    try {
      // Knockout fixtures whose participants aren't decided yet come back with
      // null team objects. Skip them — they'll be filled in on a later sync
      // once the upstream rounds complete.
      if (!fd.homeTeam?.name || !fd.awayTeam?.name) continue;
      const teamA = await upsertTeam(fd.homeTeam);
      const teamB = await upsertTeam(fd.awayTeam);
      if (teamA.created) out.teamsCreated++;
      if (teamB.created) out.teamsCreated++;
      if (teamA.linked) out.teamsLinked++;
      if (teamB.linked) out.teamsLinked++;

      const kickoff = new Date(fd.utcDate);
      const lock = enforceLockInvariant(kickoff);
      const round = stageToRound(fd.stage, fd.group);
      const group = groupCode(fd.group);

      // Already linked → update.
      const [existingByFd] = await db
        .select()
        .from(matchesTable)
        .where(eq(matchesTable.footballDataMatchId, fd.id));
      if (existingByFd) {
        await db
          .update(matchesTable)
          .set({
            tournamentId,
            round,
            group,
            teamAId: teamA.id,
            teamBId: teamB.id,
            kickoffTime: kickoff,
            lockTime: lock,
          })
          .where(eq(matchesTable.id, existingByFd.id));
        out.matchesUpdated++;
        continue;
      }

      // Try linking an unlinked match with the same team pair AND a kickoff
      // within 24h of the upstream fixture (avoids mislinking when the same
      // pair appears more than once across rounds, e.g. group + knockout).
      const [existingByTeams] = await db
        .select()
        .from(matchesTable)
        .where(
          and(
            eq(matchesTable.tournamentId, tournamentId),
            eq(matchesTable.teamAId, teamA.id),
            eq(matchesTable.teamBId, teamB.id),
          ),
        );
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;
      const closeEnough =
        existingByTeams != null &&
        Math.abs(new Date(existingByTeams.kickoffTime).getTime() - kickoff.getTime()) < ONE_DAY_MS;
      if (existingByTeams && existingByTeams.footballDataMatchId == null && closeEnough) {
        await db
          .update(matchesTable)
          .set({
            footballDataMatchId: fd.id,
            round,
            group,
            kickoffTime: kickoff,
            lockTime: lock,
          })
          .where(eq(matchesTable.id, existingByTeams.id));
        out.matchesUpdated++;
        continue;
      }

      // Insert.
      await db.insert(matchesTable).values({
        tournamentId,
        round,
        group,
        teamAId: teamA.id,
        teamBId: teamB.id,
        kickoffTime: kickoff,
        lockTime: lock,
        status: "open",
        footballDataMatchId: fd.id,
      });
      out.matchesCreated++;
    } catch (err) {
      const msg = `Match ${fd.id} (${fd.homeTeam.name} vs ${fd.awayTeam.name}): ${(err as Error).message}`;
      out.errors.push(msg);
      log?.warn({ err }, msg);
    }
  }

  if (out.errors.length === 0) await recordSyncSuccess("fixtures");
  return out;
}

async function rescoreMatch(match: MatchRow): Promise<number> {
  const allPreds = await db.select().from(predictionsTable).where(eq(predictionsTable.matchId, match.id));
  for (const p of allPreds) {
    const s = calculatePredictionPoints(p, match);
    await db
      .update(predictionsTable)
      .set({ points: s.points, resultLabel: s.label, status: "scored" })
      .where(eq(predictionsTable.id, p.id));
  }
  return allPreds.length;
}

// Predictions are scored on the 90-minute regulation result. football-data v4
// surfaces the 90-min split as `regularTime` for matches that go beyond
// regulation; for matches that end in regulation, `fullTime` IS the 90-min
// result. Prefer `regularTime` when present.
function regulationScore(fd: FdMatch): { a: number | null; b: number | null } {
  const rt = fd.score.regularTime;
  if (rt && rt.home != null && rt.away != null) {
    return { a: rt.home, b: rt.away };
  }
  return { a: fd.score.fullTime.home, b: fd.score.fullTime.away };
}

export async function syncScores(
  competitionCode = "WC",
  log?: Logger,
): Promise<SyncScoresResult> {
  const out: SyncScoresResult = {
    provider: PROVIDER,
    matchesUpdated: 0,
    matchesCompleted: 0,
    predictionsScored: 0,
    errors: [],
  };

  let fdMatches: FdMatch[];
  try {
    fdMatches = await fetchCompetitionMatches(competitionCode);
  } catch (err) {
    out.errors.push((err as Error).message);
    return out;
  }

  for (const fd of fdMatches) {
    try {
      const [existing] = await db
        .select()
        .from(matchesTable)
        .where(eq(matchesTable.footballDataMatchId, fd.id));
      if (!existing) continue; // Not linked yet — caller should run syncFixtures first.

      const reg = regulationScore(fd);
      const etA = fd.score.extraTime?.home ?? null;
      const etB = fd.score.extraTime?.away ?? null;
      const pkA = fd.score.penalties?.home ?? null;
      const pkB = fd.score.penalties?.away ?? null;
      const dur = fd.score.duration ?? null;

      // Schedule may have shifted — keep kickoff/lock in sync too.
      const newKickoff = new Date(fd.utcDate);
      const scheduleChanged = newKickoff.getTime() !== new Date(existing.kickoffTime).getTime();

      const finished = fd.status === "FINISHED";
      const wasCompleted = existing.status === "completed";
      const regulationChanged = existing.scoreA !== reg.a || existing.scoreB !== reg.b;
      const enrichmentChanged =
        existing.extraTimeScoreA !== etA ||
        existing.extraTimeScoreB !== etB ||
        existing.penaltiesScoreA !== pkA ||
        existing.penaltiesScoreB !== pkB ||
        existing.duration !== dur;

      // Skip if nothing meaningful changed.
      if (!regulationChanged && !enrichmentChanged && !scheduleChanged && finished === wasCompleted) {
        continue;
      }

      const updates: Partial<MatchRow> = {
        scoreA: reg.a,
        scoreB: reg.b,
        extraTimeScoreA: etA,
        extraTimeScoreB: etB,
        penaltiesScoreA: pkA,
        penaltiesScoreB: pkB,
        duration: dur,
      };
      if (scheduleChanged) {
        updates.kickoffTime = newKickoff;
        updates.lockTime = enforceLockInvariant(newKickoff);
      }
      if (finished) {
        updates.status = "completed";
      }

      const [updated] = await db
        .update(matchesTable)
        .set(updates)
        .where(eq(matchesTable.id, existing.id))
        .returning();
      out.matchesUpdated++;

      // Rescore predictions whenever a completed (or newly-completed) match's
      // regulation score OR its ET/penalty enrichment changed — bonuses depend
      // on the enrichment fields, so a late ET/pens update needs a re-score
      // even when the regulation result is unchanged.
      const isOrBecomesCompleted = finished || wasCompleted;
      const needsRescore =
        isOrBecomesCompleted &&
        (regulationChanged || enrichmentChanged) &&
        reg.a != null &&
        reg.b != null;
      if (needsRescore) {
        if (finished && !wasCompleted) out.matchesCompleted++;
        out.predictionsScored += await rescoreMatch(updated);
      }
    } catch (err) {
      const msg = `Match ${fd.id}: ${(err as Error).message}`;
      out.errors.push(msg);
      log?.warn({ err }, msg);
    }
  }

  if (out.errors.length === 0) await recordSyncSuccess("scores");
  return out;
}
