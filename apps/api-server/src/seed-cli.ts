// One-shot seed runner for environments without long-lived processes
// (Vercel, etc). Invoke via `tsx src/seed-cli.ts` against the target
// DATABASE_URL.
import { logger } from "./lib/logger";
import { runSeed } from "./lib/seed";

void (async () => {
  try {
    await runSeed(logger);
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "seed-cli failed");
    process.exit(1);
  }
})();
