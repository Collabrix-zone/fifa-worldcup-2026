import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const syncStatusTable = pgTable("sync_status", {
  kind: text("kind", { enum: ["fixtures", "scores"] }).primaryKey(),
  provider: text("provider").notNull(),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SyncStatusRow = typeof syncStatusTable.$inferSelect;
