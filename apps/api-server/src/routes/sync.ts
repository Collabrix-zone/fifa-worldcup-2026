import { Router, type IRouter } from "express";
import {
  SyncFixturesResponse,
  SyncScoresResponse,
  SyncRequest,
  SyncStatus,
} from "../lib/contracts";
import { requireAdmin } from "../middlewares/auth";
import { tournamentBySlug } from "../lib/leaderboard";
import { syncFixtures, syncScores, getLastSyncTimes } from "../lib/footballDataSync";
import { sendNewMatchesDigest, sendPendingResultEmails } from "../lib/notifications";

const router: IRouter = Router();
const DEFAULT_SLUG = "goalrush-2026";
const PROVIDER = "football-data.org";

router.get("/sync/status", async (_req, res): Promise<void> => {
  const times = await getLastSyncTimes();
  res.json(
    SyncStatus.parse({
      provider: PROVIDER,
      lastFixturesSyncAt: times.fixturesAt ? times.fixturesAt.toISOString() : null,
      lastScoresSyncAt: times.scoresAt ? times.scoresAt.toISOString() : null,
      pollerEnabled: !!process.env["FOOTBALL_DATA_API_TOKEN"],
    }),
  );
});

router.post("/admin/sync/fixtures", requireAdmin, async (req, res): Promise<void> => {
  const parsed = SyncRequest.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const slug = parsed.data.tournamentSlug ?? DEFAULT_SLUG;
  const t = await tournamentBySlug(slug);
  if (!t) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }
  const result = await syncFixtures(t.id, "WC", req.log);
  if (result.matchesCreated > 0) {
    void sendNewMatchesDigest(slug).catch((err) => {
      req.log.warn({ err }, "new-matches digest failed (manual sync)");
    });
  }
  res.json(SyncFixturesResponse.parse(result));
});

router.post("/admin/sync/scores", requireAdmin, async (req, res): Promise<void> => {
  const parsed = SyncRequest.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const result = await syncScores("WC", req.log);
  void sendPendingResultEmails().catch((err) => {
    req.log.warn({ err }, "result email sweep failed (manual sync)");
  });
  res.json(SyncScoresResponse.parse(result));
});

// Cron-friendly endpoints: protected by a shared CRON_SECRET passed via
// the `Authorization: Bearer <secret>` header. Designed for external
// cron services (cron-job.org, GitHub Actions, Vercel Cron, etc.) when
// running on a serverless host where the in-process poll loop can't run.
function checkCronSecret(req: Parameters<typeof router.post>[1] extends never ? never : any): boolean {
  const expected = process.env["CRON_SECRET"];
  if (!expected) return false;
  const header = String(req.headers?.authorization ?? "");
  return header === `Bearer ${expected}`;
}

router.post("/cron/sync-scores", async (req, res): Promise<void> => {
  if (!checkCronSecret(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const result = await syncScores("WC", req.log);
  void sendPendingResultEmails().catch((err) => {
    req.log.warn({ err }, "result email sweep failed (cron)");
  });
  res.json(SyncScoresResponse.parse(result));
});

router.post("/cron/sync-fixtures", async (req, res): Promise<void> => {
  if (!checkCronSecret(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const t = await tournamentBySlug(DEFAULT_SLUG);
  if (!t) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }
  const result = await syncFixtures(t.id, "WC", req.log);
  if (result.matchesCreated > 0) {
    void sendNewMatchesDigest(DEFAULT_SLUG).catch((err) => {
      req.log.warn({ err }, "new-matches digest failed (cron)");
    });
  }
  res.json(SyncFixturesResponse.parse(result));
});

export default router;
