import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { tournamentsTable } from "./tournaments";
import { teamsTable } from "./teams";

export const matchesTable = pgTable("matches", {
  id: serial("id").primaryKey(),
  tournamentId: integer("tournament_id").notNull().references(() => tournamentsTable.id, { onDelete: "cascade" }),
  round: text("round").notNull().default("Group Stage"),
  group: text("group").notNull().default(""),
  teamAId: integer("team_a_id").notNull().references(() => teamsTable.id),
  teamBId: integer("team_b_id").notNull().references(() => teamsTable.id),
  kickoffTime: timestamp("kickoff_time", { withTimezone: true }).notNull(),
  lockTime: timestamp("lock_time", { withTimezone: true }).notNull(),
  status: text("status", { enum: ["open", "locked", "completed"] }).notNull().default("open"),
  // Final score at end of regulation (90 min) — what predictions are scored against.
  scoreA: integer("score_a"),
  scoreB: integer("score_b"),
  // Knockout enrichment from live feed (display only — does not affect scoring).
  extraTimeScoreA: integer("extra_time_score_a"),
  extraTimeScoreB: integer("extra_time_score_b"),
  penaltiesScoreA: integer("penalties_score_a"),
  penaltiesScoreB: integer("penalties_score_b"),
  duration: text("duration", { enum: ["REGULAR", "EXTRA_TIME", "PENALTY_SHOOTOUT"] }),
  // Maps to football-data.org match id when synced from the live feed.
  footballDataMatchId: integer("football_data_match_id").unique(),
  // Notification bookkeeping. Once stamped, we never re-send for that match.
  openEmailSentAt: timestamp("open_email_sent_at", { withTimezone: true }),
  resultEmailSentAt: timestamp("result_email_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type MatchRow = typeof matchesTable.$inferSelect;
