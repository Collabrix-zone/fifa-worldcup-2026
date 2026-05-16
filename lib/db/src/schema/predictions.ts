import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { matchesTable } from "./matches";
import { tournamentsTable } from "./tournaments";

export const predictionsTable = pgTable("predictions", {
  id: serial("id").primaryKey(),
  tournamentId: integer("tournament_id").notNull().references(() => tournamentsTable.id, { onDelete: "cascade" }),
  matchId: integer("match_id").notNull().references(() => matchesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // Required regulation (90-min) prediction — what base scoring uses.
  predictedScoreA: integer("predicted_score_a").notNull(),
  predictedScoreB: integer("predicted_score_b").notNull(),
  // Optional knockout bonus predictions (display-only on group-stage matches).
  predictedExtraTimeA: integer("predicted_extra_time_a"),
  predictedExtraTimeB: integer("predicted_extra_time_b"),
  predictedPenaltiesA: integer("predicted_penalties_a"),
  predictedPenaltiesB: integer("predicted_penalties_b"),
  points: integer("points"),
  resultLabel: text("result_label", { enum: ["Exact Score", "Goal Difference", "Correct Result", "One Team Score", "Missed"] }),
  status: text("status", { enum: ["submitted", "locked", "scored"] }).notNull().default("submitted"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  uniqMatchUser: uniqueIndex("predictions_match_user_uniq").on(t.matchId, t.userId),
}));

export type PredictionRow = typeof predictionsTable.$inferSelect;
