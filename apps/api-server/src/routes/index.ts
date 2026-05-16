import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import tournamentsRouter from "./tournaments";
import matchesRouter from "./matches";
import predictionsRouter from "./predictions";
import leaderboardRouter from "./leaderboard";
import teamsRouter from "./teams";
import adminRouter from "./admin";
import syncRouter from "./sync";
import meRouter from "./me";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(tournamentsRouter);
router.use(matchesRouter);
router.use(predictionsRouter);
router.use(leaderboardRouter);
router.use(teamsRouter);
router.use(adminRouter);
router.use(syncRouter);
router.use(meRouter);
router.use(storageRouter);

export default router;
