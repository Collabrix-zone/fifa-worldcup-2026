import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const objectFilesTable = pgTable("object_files", {
  id: serial("id").primaryKey(),
  objectPath: text("object_path").notNull().unique(),
  originalName: text("original_name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  dataBase64: text("data_base64"),
  uploaded: boolean("uploaded").notNull().default(false),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
});

export type ObjectFileRow = typeof objectFilesTable.$inferSelect;
