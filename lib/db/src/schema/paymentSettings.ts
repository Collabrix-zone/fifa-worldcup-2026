import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Singleton row (id=1) holding the admin's UPI receiving info shown to every
// pending user on the /payment screen. Stored as a table (not a config file)
// so admins can rotate it from the UI without redeploys.
export const paymentSettingsTable = pgTable("payment_settings", {
  id: serial("id").primaryKey(),
  upiId: text("upi_id").notNull(),
  upiDisplayName: text("upi_display_name").notNull(),
  // QR PNG/JPG object path uploaded by admin.
  qrCodeUrl: text("qr_code_url"),
  // Static text shown on the payment screen — "Top scorer wins a pizza from YesFam India" etc.
  prizeNote: text("prize_note"),
  entryFeeAmount: integer("entry_fee_amount").notNull().default(100),
  entryFeeCurrency: text("entry_fee_currency").notNull().default("INR"),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type PaymentSettingsRow = typeof paymentSettingsTable.$inferSelect;
