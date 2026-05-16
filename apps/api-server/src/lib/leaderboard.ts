import { db, predictionsTable, participantsTable, matchesTable, usersTable, tournamentsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";

export interface LeaderboardEntry {
  userId: number;
  displayName: string;
  rank: number;
  totalPoints: number;
  exactScores: number;
  correctResults: number;
  goalDifferenceHits: number;
  oneTeamScoreHits: number;
  lastMatchPoints: number;
  isMe: boolean;
}

export interface LeaderboardOptions {
  filter?: "overall" | "group_stage" | "knockouts" | "this_week";
  currentUserId?: number;
}

export async function computeLeaderboard(
  tournamentId: number,
  opts: LeaderboardOptions = {},
): Promise<LeaderboardEntry[]> {
  const { filter = "overall", currentUserId } = opts;

  // All participants (so users with 0 points still show up). Admins +
  // banned users are filtered out so they never appear on the public
  // leaderboard, even if someone manually added them to participants.
  const participants = await db
    .select({
      userId: participantsTable.userId,
      displayName: participantsTable.displayName,
    })
    .from(participantsTable)
    .innerJoin(usersTable, eq(usersTable.id, participantsTable.userId))
    .where(
      and(
        eq(participantsTable.tournamentId, tournamentId),
        eq(usersTable.role, "user"),
        eq(usersTable.banned, false),
      ),
    );

  if (participants.length === 0) return [];

  // Build prediction filter conditions.
  const conditions = [
    eq(predictionsTable.tournamentId, tournamentId),
    eq(predictionsTable.status, "scored"),
  ];

  // Pull all scored predictions joined with their match for filter checks.
  const scoredRows = await db
    .select({
      userId: predictionsTable.userId,
      points: predictionsTable.points,
      label: predictionsTable.resultLabel,
      round: matchesTable.round,
      kickoffTime: matchesTable.kickoffTime,
    })
    .from(predictionsTable)
    .innerJoin(matchesTable, eq(matchesTable.id, predictionsTable.matchId))
    .where(and(...conditions));

  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const filteredRows = scoredRows.filter((r) => {
    if (filter === "overall") return true;
    if (filter === "group_stage") return /group/i.test(r.round);
    if (filter === "knockouts") return !/group/i.test(r.round);
    if (filter === "this_week") return new Date(r.kickoffTime).getTime() >= oneWeekAgo;
    return true;
  });

  // Find the most recent completed match overall (for "last match points").
  const [lastMatch] = await db
    .select({ id: matchesTable.id })
    .from(matchesTable)
    .where(and(eq(matchesTable.tournamentId, tournamentId), eq(matchesTable.status, "completed")))
    .orderBy(desc(matchesTable.kickoffTime))
    .limit(1);

  const lastMatchPointsByUser = new Map<number, number>();
  if (lastMatch) {
    const lastRows = await db
      .select({ userId: predictionsTable.userId, points: predictionsTable.points })
      .from(predictionsTable)
      .where(eq(predictionsTable.matchId, lastMatch.id));
    for (const r of lastRows) {
      lastMatchPointsByUser.set(r.userId, r.points ?? 0);
    }
  }

  // Aggregate per user.
  type Agg = {
    totalPoints: number;
    exactScores: number;
    correctResults: number;
    goalDifferenceHits: number;
    oneTeamScoreHits: number;
  };
  const agg = new Map<number, Agg>();
  for (const p of participants) {
    agg.set(p.userId, {
      totalPoints: 0,
      exactScores: 0,
      correctResults: 0,
      goalDifferenceHits: 0,
      oneTeamScoreHits: 0,
    });
  }

  for (const r of filteredRows) {
    const a = agg.get(r.userId);
    if (!a) continue;
    a.totalPoints += r.points ?? 0;
    if (r.label === "Exact Score") a.exactScores++;
    else if (r.label === "Goal Difference") a.goalDifferenceHits++;
    else if (r.label === "Correct Result") a.correctResults++;
    else if (r.label === "One Team Score") a.oneTeamScoreHits++;
  }

  const entries = participants.map((p) => {
    const a = agg.get(p.userId)!;
    return {
      userId: p.userId,
      displayName: p.displayName,
      totalPoints: a.totalPoints,
      exactScores: a.exactScores,
      correctResults: a.correctResults,
      goalDifferenceHits: a.goalDifferenceHits,
      oneTeamScoreHits: a.oneTeamScoreHits,
      lastMatchPoints: lastMatchPointsByUser.get(p.userId) ?? 0,
      isMe: currentUserId === p.userId,
    };
  });

  entries.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.exactScores !== a.exactScores) return b.exactScores - a.exactScores;
    return a.displayName.localeCompare(b.displayName);
  });

  let lastPoints = -Infinity;
  let lastRank = 0;
  return entries.map((e, i) => {
    const rank = e.totalPoints === lastPoints ? lastRank : i + 1;
    lastPoints = e.totalPoints;
    lastRank = rank;
    return { ...e, rank };
  });
}

export async function tournamentBySlug(slug: string) {
  const [t] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.slug, slug));
  return t ?? null;
}

// Used by user stats endpoint
export async function getUserCounts(tournamentId: number, userId: number) {
  const [{ totalUsers }] = await db
    .select({ totalUsers: sql<number>`cast(count(*) as int)` })
    .from(usersTable);
  return { totalUsers };
}
