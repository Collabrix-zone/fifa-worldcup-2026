import {
  db,
  usersTable,
  tournamentsTable,
  teamsTable,
  matchesTable,
  predictionsTable,
  participantsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { hashPassword } from "./auth";
import { calculateScore } from "./scoring";
import type { Logger } from "pino";

const TOURNAMENT_SLUG = "goalrush-2026";

interface SeedTeam {
  name: string;
  code: string;
  flag: string;
}

const TEAMS: SeedTeam[] = [
  { name: "Argentina", code: "ARG", flag: "🇦🇷" },
  { name: "Morocco", code: "MAR", flag: "🇲🇦" },
  { name: "Brazil", code: "BRA", flag: "🇧🇷" },
  { name: "Japan", code: "JPN", flag: "🇯🇵" },
  { name: "France", code: "FRA", flag: "🇫🇷" },
  { name: "Canada", code: "CAN", flag: "🇨🇦" },
  { name: "Germany", code: "GER", flag: "🇩🇪" },
  { name: "Mexico", code: "MEX", flag: "🇲🇽" },
  { name: "Spain", code: "ESP", flag: "🇪🇸" },
  { name: "USA", code: "USA", flag: "🇺🇸" },
  { name: "Portugal", code: "POR", flag: "🇵🇹" },
  { name: "Ghana", code: "GHA", flag: "🇬🇭" },
  { name: "England", code: "ENG", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { name: "South Korea", code: "KOR", flag: "🇰🇷" },
  { name: "Netherlands", code: "NED", flag: "🇳🇱" },
  { name: "Australia", code: "AUS", flag: "🇦🇺" },
];

interface SeedUser {
  name: string;
  email: string;
  password: string;
  role: "user" | "admin";
}

const USERS: SeedUser[] = [
  { name: "Divyansh Sharma", email: "divyansh@example.com", password: "admin123", role: "admin" },
  { name: "Henil Doshi", email: "henil@example.com", password: "user123", role: "user" },
  { name: "Jayvin Goswami", email: "jayvin@example.com", password: "user123", role: "user" },
  { name: "Jaydeepsinh Zala", email: "jaydeepsinh@example.com", password: "user123", role: "user" },
  { name: "Harshal Jain", email: "harshal@example.com", password: "user123", role: "user" },
  { name: "Abhishek Reddy", email: "abhishek@example.com", password: "user123", role: "user" },
  { name: "Nairit Gala", email: "nairit@example.com", password: "user123", role: "user" },
  { name: "Drishti", email: "drishti@example.com", password: "user123", role: "user" },
  { name: "Jagaddish", email: "jagaddish@example.com", password: "user123", role: "user" },
  { name: "Anila Durbha", email: "anila@example.com", password: "user123", role: "user" },
];

interface SeedMatch {
  teamA: string;
  teamB: string;
  group: string;
  round: string;
  kickoffOffsetDays: number; // days from now
  scoreA?: number;
  scoreB?: number;
}

// 5 completed (in the past) + 8 upcoming
const SEED_MATCHES: SeedMatch[] = [
  // Completed
  { teamA: "Argentina", teamB: "Morocco", group: "A", round: "Group Stage", kickoffOffsetDays: -10, scoreA: 2, scoreB: 1 },
  { teamA: "Brazil", teamB: "Japan", group: "B", round: "Group Stage", kickoffOffsetDays: -9, scoreA: 3, scoreB: 0 },
  { teamA: "France", teamB: "Canada", group: "C", round: "Group Stage", kickoffOffsetDays: -8, scoreA: 1, scoreB: 1 },
  { teamA: "Germany", teamB: "Mexico", group: "D", round: "Group Stage", kickoffOffsetDays: -7, scoreA: 2, scoreB: 1 },
  { teamA: "Spain", teamB: "USA", group: "E", round: "Group Stage", kickoffOffsetDays: -6, scoreA: 4, scoreB: 2 },
  // Upcoming
  { teamA: "Portugal", teamB: "Ghana", group: "F", round: "Group Stage", kickoffOffsetDays: 1 },
  { teamA: "England", teamB: "South Korea", group: "G", round: "Group Stage", kickoffOffsetDays: 2 },
  { teamA: "Netherlands", teamB: "Australia", group: "H", round: "Group Stage", kickoffOffsetDays: 3 },
  { teamA: "Argentina", teamB: "Brazil", group: "Knockout", round: "Round of 16", kickoffOffsetDays: 5 },
  { teamA: "France", teamB: "Germany", group: "Knockout", round: "Round of 16", kickoffOffsetDays: 6 },
  { teamA: "Spain", teamB: "Portugal", group: "Knockout", round: "Round of 16", kickoffOffsetDays: 7 },
  { teamA: "Japan", teamB: "South Korea", group: "Knockout", round: "Round of 16", kickoffOffsetDays: 8 },
  { teamA: "Mexico", teamB: "USA", group: "Knockout", round: "Round of 16", kickoffOffsetDays: 9 },
];

// Sample predictions for each user on past matches: [predA, predB] tuples per match index.
const PREDICTIONS_BY_USER: Record<string, Array<[number, number]>> = {
  "divyansh@example.com": [[2, 1], [2, 0], [2, 0], [1, 0], [3, 1]],
  "henil@example.com":    [[1, 1], [3, 0], [1, 1], [2, 1], [3, 2]],
  "jayvin@example.com":   [[2, 1], [2, 1], [1, 0], [2, 1], [4, 2]],
  "jaydeepsinh@example.com": [[3, 1], [3, 0], [2, 2], [1, 1], [2, 2]],
  "harshal@example.com":  [[1, 0], [2, 0], [0, 0], [2, 0], [3, 1]],
  "abhishek@example.com": [[2, 0], [3, 1], [1, 0], [1, 0], [4, 2]],
  "nairit@example.com":   [[1, 1], [2, 0], [2, 1], [3, 1], [2, 1]],
  "drishti@example.com":  [[2, 1], [4, 0], [1, 2], [0, 0], [1, 1]],
  "jagaddish@example.com": [[0, 1], [2, 1], [3, 0], [1, 1], [2, 0]],
  "anila@example.com":    [[1, 2], [1, 0], [2, 1], [0, 1], [3, 0]],
};

export async function runSeed(log: Logger): Promise<void> {
  // Skip if already seeded.
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(usersTable);
  if (count > 0) {
    log.info({ existingUsers: count }, "Seed: users exist, skipping");
    return;
  }

  log.info("Seed: starting initial data load");

  // Users
  const userIdsByEmail = new Map<string, number>();
  for (const u of USERS) {
    const passwordHash = await hashPassword(u.password);
    const [row] = await db
      .insert(usersTable)
      .values({
        name: u.name,
        email: u.email,
        passwordHash,
        role: u.role,
        // Seeded users are pre-verified and pre-paid so the leaderboard +
        // predictions flows work out of the box during development.
        emailVerified: true,
        paymentStatus: "paid",
        paymentSubmittedAt: new Date(),
        paymentReviewedAt: new Date(),
        identityStatus: "verified",
      })
      .returning({ id: usersTable.id });
    userIdsByEmail.set(u.email, row.id);
  }

  const adminId = userIdsByEmail.get("divyansh@example.com")!;

  // Tournament
  const [tournament] = await db
    .insert(tournamentsTable)
    .values({
      name: "Football Kickoff 2026",
      slug: TOURNAMENT_SLUG,
      description: "The 2026 World Football prediction league. Submit your scores before kickoff and battle for the trophy.",
      status: "live",
      isPublic: true,
      createdBy: adminId,
    })
    .returning();

  // Teams
  const teamIdsByName = new Map<string, number>();
  for (const t of TEAMS) {
    const [row] = await db.insert(teamsTable).values(t).returning({ id: teamsTable.id });
    teamIdsByName.set(t.name, row.id);
  }

  // Matches
  const matchRows: Array<{ id: number; status: "open" | "locked" | "completed"; scoreA: number | null; scoreB: number | null }> = [];
  for (const m of SEED_MATCHES) {
    const kickoff = new Date(Date.now() + m.kickoffOffsetDays * 24 * 60 * 60 * 1000);
    const lockTime = new Date(kickoff.getTime() - 15 * 60 * 1000);
    const completed = m.scoreA !== undefined && m.scoreB !== undefined;
    const [row] = await db
      .insert(matchesTable)
      .values({
        tournamentId: tournament.id,
        round: m.round,
        group: m.group,
        teamAId: teamIdsByName.get(m.teamA)!,
        teamBId: teamIdsByName.get(m.teamB)!,
        kickoffTime: kickoff,
        lockTime,
        status: completed ? "completed" : "open",
        scoreA: completed ? m.scoreA! : null,
        scoreB: completed ? m.scoreB! : null,
      })
      .returning({ id: matchesTable.id });
    matchRows.push({ id: row.id, status: completed ? "completed" : "open", scoreA: completed ? m.scoreA! : null, scoreB: completed ? m.scoreB! : null });
  }

  // Participants — everyone joins
  for (const u of USERS) {
    await db.insert(participantsTable).values({
      tournamentId: tournament.id,
      userId: userIdsByEmail.get(u.email)!,
      displayName: u.name,
      status: "active",
    });
  }

  // Predictions for completed matches
  const completedMatchIds = matchRows.filter((m) => m.status === "completed");
  for (const u of USERS) {
    const preds = PREDICTIONS_BY_USER[u.email];
    if (!preds) continue;
    for (let i = 0; i < completedMatchIds.length; i++) {
      const m = completedMatchIds[i];
      const [pa, pb] = preds[i] ?? [0, 0];
      const score = calculateScore(pa, pb, m.scoreA!, m.scoreB!);
      await db.insert(predictionsTable).values({
        tournamentId: tournament.id,
        matchId: m.id,
        userId: userIdsByEmail.get(u.email)!,
        predictedScoreA: pa,
        predictedScoreB: pb,
        points: score.points,
        resultLabel: score.label,
        status: "scored",
      });
    }
  }

  log.info(
    { users: USERS.length, teams: TEAMS.length, matches: SEED_MATCHES.length },
    "Seed: complete",
  );
}
