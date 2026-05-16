import app from "./app";
import { logger } from "./lib/logger";
import { runSeed } from "./lib/seed";
import { db, tournamentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { syncScores, syncFixtures } from "./lib/footballDataSync";
import { sendNewMatchesDigest, sendPendingResultEmails } from "./lib/notifications";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const DEFAULT_TOURNAMENT_SLUG = "goalrush-2026";

async function start(): Promise<void> {
  try {
    await runSeed(logger);
  } catch (err) {
    logger.error({ err }, "Seed failed (continuing anyway)");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });

  startBackgroundSync();
}

// Background sync loop — runs both fixture and score syncs so admins never
// have to click anything. Schedule:
//   - scores  : every 2 minutes (well under football-data free-tier 10 req/min)
//   - fixtures: every 6 hours (schedule shifts are rare)
// First fixture sync happens 30s after boot so the schedule + crests refresh
// without delaying server startup.
function startBackgroundSync(): void {
  if (!process.env["FOOTBALL_DATA_API_TOKEN"]) {
    logger.info("FOOTBALL_DATA_API_TOKEN not set — auto sync disabled.");
    return;
  }

  const SCORE_INTERVAL_MS = 2 * 60 * 1000;
  const FIXTURE_INTERVAL_MS = 6 * 60 * 60 * 1000;
  let scoreInFlight = false;
  let fixtureInFlight = false;
  let lastFixtureRun = 0;

  const runScores = async () => {
    if (scoreInFlight) return;
    scoreInFlight = true;
    try {
      const result = await syncScores("WC", logger);
      // Always sweep — `matchesCompleted` from syncScores misses transitions
      // that don't simultaneously change the regulation/enrichment scores,
      // so gating on it would silently drop result emails. The sweep is a
      // cheap indexed query when nothing's pending.
      try {
        const out = await sendPendingResultEmails();
        if (out.sent > 0) logger.info({ ...out }, "result emails sent (background)");
      } catch (err) {
        logger.warn({ err }, "result email sweep failed");
      }
      if (result.matchesUpdated > 0 || result.errors.length > 0) {
        logger.info(
          {
            matchesUpdated: result.matchesUpdated,
            matchesCompleted: result.matchesCompleted,
            predictionsScored: result.predictionsScored,
            errors: result.errors,
          },
          "Background score sync",
        );
      }
    } catch (err) {
      logger.warn({ err }, "Background score sync failed");
    } finally {
      scoreInFlight = false;
    }
  };

  const runFixtures = async () => {
    if (fixtureInFlight) return;
    fixtureInFlight = true;
    try {
      const [t] = await db
        .select()
        .from(tournamentsTable)
        .where(eq(tournamentsTable.slug, DEFAULT_TOURNAMENT_SLUG));
      if (!t) return;
      const result = await syncFixtures(t.id, "WC", logger);
      logger.info(
        {
          matchesCreated: result.matchesCreated,
          matchesUpdated: result.matchesUpdated,
          teamsCreated: result.teamsCreated,
          teamsLinked: result.teamsLinked,
          errors: result.errors,
        },
        "Background fixture sync",
      );
      lastFixtureRun = Date.now();
      if (result.matchesCreated > 0) {
        try {
          const out = await sendNewMatchesDigest(DEFAULT_TOURNAMENT_SLUG);
          if (out.sent > 0) {
            logger.info({ ...out }, "new-matches digest sent");
          }
        } catch (err) {
          logger.warn({ err }, "new-matches digest failed");
        }
      }
    } catch (err) {
      logger.warn({ err }, "Background fixture sync failed");
    } finally {
      fixtureInFlight = false;
    }
  };

  // Kick off an initial fixture sync shortly after boot.
  setTimeout(() => void runFixtures(), 30 * 1000);

  setInterval(() => {
    void runScores();
    if (Date.now() - lastFixtureRun >= FIXTURE_INTERVAL_MS) {
      void runFixtures();
    }
  }, SCORE_INTERVAL_MS);

  logger.info(
    { scoreIntervalMs: SCORE_INTERVAL_MS, fixtureIntervalMs: FIXTURE_INTERVAL_MS },
    "Background sync started (scores every 2 min, fixtures every 6 h)",
  );
}

void start();
