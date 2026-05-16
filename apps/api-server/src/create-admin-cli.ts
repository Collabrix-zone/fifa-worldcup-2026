// One-shot admin creator. Bypasses signup funnel: sets role=admin,
// emailVerified=true, paymentStatus=paid, identityStatus=verified, and
// deliberately skips the tournament participants table so the account
// never appears on public leaderboards or member lists.
//
// Usage: pnpm --filter @workspace/api-server run create-admin
//        (reads ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD from env)

import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function main() {
  const name = process.env.ADMIN_NAME;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!name || !email || !password) {
    console.error("Missing env: ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));

  if (existing) {
    await db
      .update(usersTable)
      .set({
        name,
        passwordHash,
        role: "admin",
        emailVerified: true,
        paymentStatus: "paid",
        identityStatus: "verified",
      })
      .where(eq(usersTable.id, existing.id));
    console.log(`Updated existing user as admin: ${email} (id=${existing.id})`);
  } else {
    const [row] = await db
      .insert(usersTable)
      .values({
        name,
        email,
        passwordHash,
        role: "admin",
        emailVerified: true,
        paymentStatus: "paid",
        identityStatus: "verified",
      })
      .returning({ id: usersTable.id });
    console.log(`Created admin: ${email} (id=${row?.id})`);
  }

  console.log("Done. This account is NOT joined to any tournament (invisible on leaderboard).");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
