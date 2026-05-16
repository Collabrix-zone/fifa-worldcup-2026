import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const teamsTable = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  code: text("code").notNull(),
  flag: text("flag").notNull().default(""),
  primaryColor: text("primary_color"),
  secondaryColor: text("secondary_color"),
  // Maps to football-data.org team id when synced from the live feed.
  footballDataTeamId: integer("football_data_team_id").unique(),
  crestUrl: text("crest_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TeamRow = typeof teamsTable.$inferSelect;
