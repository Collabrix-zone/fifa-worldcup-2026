import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  googleId: text("google_id").unique(),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),

  // Profile photo object path; served via /api/storage<objectPath>.
  avatarUrl: text("avatar_url"),

  // Email verification (skipped automatically for Google sign-in users)
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerificationCode: text("email_verification_code"),
  emailVerificationExpiresAt: timestamp("email_verification_expires_at", { withTimezone: true }),

  // Entry-fee payment (UPI honor system: user uploads screenshot, admin approves)
  paymentStatus: text("payment_status", {
    enum: ["unpaid", "submitted", "paid", "rejected"],
  })
    .notNull()
    .default("unpaid"),
  paymentScreenshotUrl: text("payment_screenshot_url"),
  paymentSubmittedAt: timestamp("payment_submitted_at", { withTimezone: true }),
  paymentReviewedAt: timestamp("payment_reviewed_at", { withTimezone: true }),
  paymentNotes: text("payment_notes"),

  // Identity verification (admin reviews selfie vs profile photo)
  identityPhotoUrl: text("identity_photo_url"),
  identityStatus: text("identity_status", {
    enum: ["unsubmitted", "pending", "verified", "rejected"],
  })
    .notNull()
    .default("unsubmitted"),
  identitySubmittedAt: timestamp("identity_submitted_at", { withTimezone: true }),
  identityReviewedAt: timestamp("identity_reviewed_at", { withTimezone: true }),
  identityNotes: text("identity_notes"),

  // Moderation. Banned users can still sign in but every authed call returns
  // 403 with code BANNED so the UI can show a banner explaining the reason.
  banned: boolean("banned").notNull().default(false),
  banReason: text("ban_reason"),
  bannedAt: timestamp("banned_at", { withTimezone: true }),

  // Display-name lock. Once the user submits their name the first time we
  // stamp this column; further edits are blocked server-side and only an
  // admin can clear it / overwrite the name.
  displayNameLockedAt: timestamp("display_name_locked_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type UserRow = typeof usersTable.$inferSelect;
