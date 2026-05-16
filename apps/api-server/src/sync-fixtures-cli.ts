// One-shot fixture sync against football-data.org. Ensures the default
// tournament row exists, then pulls all matches for the configured
// competition code (FOOTBALL_DATA_COMPETITION, defaults to "WC").
//
// Usage:
//   FOOTBALL_DATA_API_TOKEN=... DATABASE_URL=... \
//   pnpm --filter @workspace/api-server run sync-fixtures

import { db, tournamentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./lib/logger";
import { syncFixtures } from "./lib/footballDataSync";

const DEFAULT_SLUG = "goalrush-2026";
const DEFAULT_NAME = "Football Kickoff 2026";

async function main() {
  if (!process.env.FOOTBALL_DATA_API_TOKEN) {
    console.error("Missing env: FOOTBALL_DATA_API_TOKEN");
    process.exit(1);
  }
  const competition = process.env.FOOTBALL_DATA_COMPETITION ?? "WC";

  let [t] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.slug, DEFAULT_SLUG));
  if (!t) {
    const [created] = await db
      .insert(tournamentsTable)
      .values({ slug: DEFAULT_SLUG, name: DEFAULT_NAME })
      .returning();
    t = created;
    logger.info({ slug: DEFAULT_SLUG, id: t?.id }, "Tournament created");
  }
  if (!t) {
    console.error("Failed to ensure tournament row");
    process.exit(1);
  }

  logger.info({ tournamentId: t.id, competition }, "Starting fixture sync");
  const result = await syncFixtures(t.id, competition, logger);
  logger.info(
    {
      matchesCreated: result.matchesCreated,
      matchesUpdated: result.matchesUpdated,
      teamsCreated: result.teamsCreated,
      teamsLinked: result.teamsLinked,
      errors: result.errors,
    },
    "Fixture sync complete",
  );
  process.exit(result.errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
