import { Router, type IRouter } from "express";
import { LeaderboardEntry } from "../lib/contracts";
import { computeLeaderboard, tournamentBySlug } from "../lib/leaderboard";

const router: IRouter = Router();

router.get("/tournaments/:slug/leaderboard", async (req, res): Promise<void> => {
  const slug = String(req.params.slug);
  const filter = (typeof req.query.filter === "string" ? req.query.filter : "overall") as
    | "overall"
    | "group_stage"
    | "knockouts"
    | "this_week";

  const t = await tournamentBySlug(slug);
  if (!t) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }

  const entries = await computeLeaderboard(t.id, {
    filter,
    currentUserId: req.user?.id,
  });
  res.json(entries.map((e) => LeaderboardEntry.parse(e)));
});

export default router;
