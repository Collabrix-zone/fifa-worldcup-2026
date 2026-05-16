import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { tournamentsTable } from "./tournaments";

export const participantsTable = pgTable("participants", {
  id: serial("id").primaryKey(),
  tournamentId: integer("tournament_id").notNull().references(() => tournamentsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  status: text("status", { enum: ["active", "pending", "blocked"] }).notNull().default("active"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqTournamentUser: uniqueIndex("participants_tournament_user_uniq").on(t.tournamentId, t.userId),
}));

export type ParticipantRow = typeof participantsTable.$inferSelect;
