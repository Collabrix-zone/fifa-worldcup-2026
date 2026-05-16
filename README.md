# Football Kickoff 2026

Football Kickoff 2026 is a React + Express prediction tournament app for the
YesFam India community, built by Collabrix Zone. Players predict FIFA World Cup
2026 match scores before kickoff, picks auto-lock 15 minutes before kickoff, and
the leaderboard updates from a 7/5/3/1/0 scoring system.

The production app is live at:

https://yesfamindia-football-2026.vercel.app

## What this repo contains

This is a pnpm workspace with the web app, API server, database schema, generated
API client, and OpenAPI contract in one repo.

```text
apps/
  api-server/       Express API, auth, scoring, admin, cron endpoints
  web/              React 19 + Vite app shown to users

lib/
  api-spec/          OpenAPI source of truth
  api-client-react/  Generated React Query hooks and TypeScript types
  api-zod/           Generated Zod validators used by the server
  db/                Drizzle schema and PostgreSQL connection
  object-storage-web/ Upload helper used by the React app

api/index.ts         Vercel serverless function wrapper
vercel.json          Vercel build, output, rewrites, and server bundle includes
.github/workflows/   GitHub Actions cron for live scores and fixture sync
```

The user-facing app is already React. The server is intentionally Express
because it owns sessions, database writes, scoring, admin actions, football-data
sync, and email workflows.

## Stack

- Node.js 22
- pnpm workspaces
- TypeScript 5.9
- React 19, Vite 7, Tailwind CSS 4, shadcn/ui, Framer Motion, wouter
- Express 5, cookie sessions, bcryptjs, pino
- PostgreSQL, Drizzle ORM, pg
- OpenAPI, Orval, React Query, Zod v3, drizzle-zod
- Vercel for web/API hosting
- Neon for PostgreSQL
- Resend for email
- football-data.org for fixtures and scores

## Local setup

Install dependencies:

```bash
pnpm install
```

Create local environment files from the examples:

```bash
cp apps/api-server/.env.example apps/api-server/.env
cp apps/web/.env.example apps/web/.env
```

Use a local PostgreSQL database and set this in `apps/api-server/.env`:

```bash
DATABASE_URL=postgresql://YOUR_USER@127.0.0.1:5432/fifa_worldcup
APP_BASE_URL=http://localhost:5173
```

The app can run with email, Google OAuth, and football-data.org disabled, but
those features need their corresponding environment variables when you want to
test them end to end.

Push the database schema:

```bash
DATABASE_URL=postgresql://YOUR_USER@127.0.0.1:5432/fifa_worldcup \
  pnpm --filter @workspace/db run push
```

Seed demo users and matches:

```bash
DATABASE_URL=postgresql://YOUR_USER@127.0.0.1:5432/fifa_worldcup \
  pnpm --filter @workspace/api-server run seed
```

Run the API and web app in two terminals:

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/web run dev
```

The API runs on `http://localhost:8080`. The React app runs on
`http://localhost:5173` and proxies `/api` to the API server.

## Common commands

```bash
# Type check every package
pnpm run typecheck

# Build everything
pnpm run build

# Regenerate generated API client and Zod schemas after OpenAPI edits
pnpm --filter @workspace/api-spec run codegen

# Push Drizzle schema changes
DATABASE_URL=... pnpm --filter @workspace/db run push

# Seed demo data
DATABASE_URL=... pnpm --filter @workspace/api-server run seed

# Create an admin user
ADMIN_NAME="Ops" ADMIN_EMAIL="ops@example.com" ADMIN_PASSWORD="admin123" \
DATABASE_URL=... \
pnpm --filter @workspace/api-server run create-admin

# Sync fixtures from football-data.org
DATABASE_URL=... FOOTBALL_DATA_API_TOKEN=... \
pnpm --filter @workspace/api-server run sync-fixtures
```

## Development workflow

Most feature work touches three layers:

1. API contract in `lib/api-spec/openapi.yaml`
2. Server route or domain logic in `apps/api-server/src`
3. React page or component in `apps/web/src`

When changing request or response shapes:

1. Edit `lib/api-spec/openapi.yaml`.
2. Run `pnpm --filter @workspace/api-spec run codegen`.
3. Use generated React Query hooks and types from `@workspace/api-client-react`.
4. Use server-side validator aliases from
   `apps/api-server/src/lib/contracts.ts`.
5. Run `pnpm run typecheck`.

Do not manually edit generated files under:

- `lib/api-client-react/src/generated/`
- `lib/api-zod/src/generated/`

## Product flows

### Player flow

1. Sign up with email/password or Google.
2. Verify email with a 6-digit OTP, unless Google already verified it.
3. Submit payment proof.
4. Optionally submit identity verification.
5. Predict scores before each match lock time.
6. Follow results and leaderboard standings.

### Admin flow

Admins can manage users, payment approvals, identity approvals, match results,
fixture sync, scoring recalculation, bans, and display-name overrides.

Admins are intentionally blocked from the prediction flow:

- `/predictions` redirects admins to `/admin`.
- The match detail dialog hides prediction controls for admins.
- `POST /matches/:id/predict` returns `403 ADMIN_NO_PREDICT`.
- Leaderboard queries filter to `role = 'user'` and `banned = false`.

## Scoring

Base scoring uses the regulation-time score:

- 7 points: exact score
- 5 points: correct goal difference
- 3 points: correct result
- 1 point: one team score correct
- 0 points: no match

Knockout matches also support optional extra-time and penalty predictions:

- +2 points for exact extra-time score when the match reaches extra time or
  penalties.
- +3 points for correct penalty shootout winner when the match reaches
  penalties.

Regulation score is still the base scoring input. Do not score predictions from
full-time values that include extra time.

## Important implementation details

- `goalrush` is still used in cookie names and the tournament slug. Keep those
  stable unless you also migrate sessions and database rows.
- Cookie sessions live in the `sessions` table. The browser receives the
  `goalrush_session` HTTP-only cookie.
- In local dev, auth cookies use `SameSite=Lax` and `secure=false`.
- In production, auth cookies use `SameSite=None` and `secure=true`.
- `requireAuth` also checks bans. Do not bypass it on protected routes.
- Match lock time is a server invariant. Server code clamps lock time to
  `kickoff - 15 minutes`.
- Effective match status is computed at read time, so an open match appears
  locked once its lock window has passed.
- New signups get `displayNameLockedAt` immediately. Users cannot rename
  themselves after joining; admins can override names.
- Uploads use the existing presigned-URL client flow, backed by the app database
  for small avatars, payment screenshots, identity photos, and payment QR codes.

## Environment variables

Never commit real secrets. Use local `.env` files and deployment secret stores.

API server:

```bash
NODE_ENV=development
PORT=8080
DATABASE_URL=postgresql://USER@127.0.0.1:5432/fifa_worldcup
APP_BASE_URL=http://localhost:5173

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

RESEND_API_KEY=
MAIL_FROM=Football Kickoff 2026 <noreply@example.com>

FOOTBALL_DATA_API_TOKEN=
CRON_SECRET=
LOG_LEVEL=info
```

React app:

```bash
PORT=5173
BASE_PATH=/
API_PROXY_TARGET=http://127.0.0.1:8080
```

Production secrets are configured in Vercel and GitHub Actions. Keep GitHub
Actions secrets in sync with the cron workflow:

- `CRON_SECRET`
- `DATABASE_URL`
- `FOOTBALL_DATA_API_TOKEN`

## Hosting and cron

Production uses:

- Vercel for the React app and Express serverless API
- Neon for PostgreSQL
- Resend for email
- GitHub Actions for scheduled sync

The local long-lived API entry is `apps/api-server/src/index.ts`. It starts
the server and long-running background sync intervals.

The Vercel serverless entry is `apps/api-server/src/handler.ts`. It exports
the Express app and does not start background intervals. Production live updates
therefore depend on GitHub Actions:

- Every 5 minutes: call `POST /api/cron/sync-scores`.
- Every 6 hours: run the fixture sync CLI directly against Neon.

Manual trigger:

```bash
gh workflow run "Cron sync (scores + fixtures)" \
  --repo Collabrix-zone/fifa-worldcup-2026
```

## Where to make changes

### React app

- Pages: `apps/web/src/pages/`
- Shared app shell and navigation:
  `apps/web/src/components/AppShell.tsx`
- Auth state: `apps/web/src/context/AuthContext.tsx`
- Theme tokens and Tailwind CSS: `apps/web/src/index.css`
- Generated API hooks: `@workspace/api-client-react`

### API server

- Express app setup: `apps/api-server/src/app.ts`
- Local server entry: `apps/api-server/src/index.ts`
- Vercel handler: `apps/api-server/src/handler.ts`
- Routes: `apps/api-server/src/routes/`
- Auth middleware: `apps/api-server/src/middlewares/auth.ts`
- Scoring: `apps/api-server/src/lib/scoring.ts`
- Leaderboard: `apps/api-server/src/lib/leaderboard.ts`
- Football-data sync:
  `apps/api-server/src/lib/footballDataSync.ts`

### Database

- Schema index: `lib/db/src/schema/index.ts`
- Users: `lib/db/src/schema/users.ts`
- Matches: `lib/db/src/schema/matches.ts`
- Predictions: `lib/db/src/schema/predictions.ts`
- Participants: `lib/db/src/schema/participants.ts`
- Teams: `lib/db/src/schema/teams.ts`
- Tournaments: `lib/db/src/schema/tournaments.ts`

## Current known limitations

- Uploads are stored in PostgreSQL and capped at 10 MB per file. This is simple
  and portable for the current small-file workflows; switch to S3/R2/Supabase if
  large or high-volume media becomes important.
- Fixture sync takes too long for the Vercel serverless timeout, so GitHub
  Actions runs it directly.
- Live score sync only runs when the GitHub Actions cron is active.
- The main web bundle is currently large enough to trigger a Vite warning.
  Consider route-level splitting or manual chunks if startup performance becomes
  a problem.

## Contributing notes

- Keep product flows intact unless the issue explicitly asks to change them.
- Keep `goalrush` technical identifiers stable unless you plan a migration.
- Keep API shape changes contract-first through OpenAPI and Orval.
- Keep generated files generated.
- Run `pnpm run typecheck` before opening a PR.
- Do not commit `.env`, database URLs, API tokens, screenshots with secrets, or
  production credentials.

## License

MIT. See `LICENSE`.
