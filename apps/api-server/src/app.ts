import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "node:path";
import fs from "node:fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { attachUser } from "./middlewares/auth";

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(attachUser);

app.use("/api", router);

// Serve the built React app in production from a single service (used by the
// Render single-service shape). Skip entirely on Vercel — Vercel serves the
// Vite output directly from outputDirectory and the api/index.ts function
// only handles /api/*, so SPA fallback here would never fire and the regex
// route is a needless Express 5 / path-to-regexp risk.
const skipStatic = process.env.SKIP_STATIC === "1" || process.env.VERCEL === "1";
if (!skipStatic) {
  const STATIC_DIR =
    process.env.STATIC_DIR ??
    path.resolve(process.cwd(), "..", "web", "dist", "public");
  if (fs.existsSync(STATIC_DIR)) {
    app.use(express.static(STATIC_DIR, { index: false, maxAge: "1h" }));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(STATIC_DIR, "index.html"));
    });
    logger.info({ STATIC_DIR }, "Serving static frontend");
  } else {
    logger.info({ STATIC_DIR }, "Static dir absent — API-only mode");
  }
}

export default app;
