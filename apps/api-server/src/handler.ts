// Vercel serverless entry. Exports the Express app so @vercel/node can
// invoke it as a request handler. Skips listen(), seed, and background
// sync — those run in long-lived processes (local dev, Render). On
// serverless we expose admin sync endpoints + rely on external cron or
// manual triggers.
import app from "./app";
export default app;
