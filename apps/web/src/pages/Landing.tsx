import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { motion, useReducedMotion } from "framer-motion";
import {
  useListMatches,
  useGetLeaderboard,
  getListMatchesQueryKey,
  getGetLeaderboardQueryKey,
} from "@workspace/api-client-react";
import { TOURNAMENT_SLUG } from "@/lib/constants";

const IST_FMT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const IST_TIME = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
import {
  ArrowRight,
  CalendarClock,
  ChevronRight,
  Clock,
  Crown,
  Lock,
  Pizza,
  Sparkles,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import yesfamLogo from "@/assets/yesfam-logo.svg";

// All match dates render in IST (Asia/Kolkata) regardless of the browser
// timezone — this is a YesFam India league, the audience is in India.
function istDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}
function formatKickoff(iso: string): string {
  const d = new Date(iso);
  const today = istDayKey(new Date());
  const tomorrow = istDayKey(new Date(Date.now() + 24 * 3600_000));
  const target = istDayKey(d);
  const time = `${IST_TIME.format(d)} IST`;
  if (target === today) return `Today · ${time}`;
  if (target === tomorrow) return `Tomorrow · ${time}`;
  return `${IST_FMT.format(d)} IST`;
}

const scoring = [
  { points: 7, label: "Exact score" },
  { points: 5, label: "Goal difference" },
  { points: 3, label: "Correct result" },
  { points: 1, label: "One team" },
];

const features = [
  {
    icon: Lock,
    title: "Auto-lock at T-15",
    desc: "Predictions seal fifteen minutes before kickoff. Server-enforced.",
  },
  {
    icon: Zap,
    title: "Live point updates",
    desc: "Official scores sync every two minutes. Leaderboard never stale.",
  },
  {
    icon: Trophy,
    title: "Tiered scoring",
    desc: "Seven for the exact line. Partial credit for getting close.",
  },
];

export default function Landing() {
  const { isLoggedIn, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const reduceMotion = useReducedMotion();

  // Public reads — no auth required, safe to call from marketing home.
  // Refetch every 60s so fixture changes and leaderboard updates surface
  // without the visitor having to reload.
  const matchesQ = useListMatches(
    TOURNAMENT_SLUG,
    { status: "open" },
    {
      query: {
        queryKey: getListMatchesQueryKey(TOURNAMENT_SLUG, { status: "open" }),
        refetchInterval: 60_000,
      },
    },
  );
  const leaderboardQ = useGetLeaderboard(
    TOURNAMENT_SLUG,
    { filter: "overall" },
    {
      query: {
        queryKey: getGetLeaderboardQueryKey(TOURNAMENT_SLUG, { filter: "overall" }),
        refetchInterval: 60_000,
      },
    },
  );

  const openMatches = (matchesQ.data ?? [])
    .filter((m) => m.status === "open")
    .sort((a, b) => new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime())
    .slice(0, 3);

  const lbRows = leaderboardQ.data ?? [];
  const top3 = lbRows.slice(0, 3);
  const playerCount = lbRows.length;
  const nextKickoff = openMatches[0]?.kickoffTime;

  // Local 30-second tick so the "next deadline" countdown stays fresh
  // between the slower 60s data refetch.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const nextDeadline = nextKickoff
    ? (() => {
        const ms = new Date(nextKickoff).getTime() - 15 * 60_000 - Date.now();
        if (ms <= 0) return "Now";
        const days = Math.floor(ms / 86_400_000);
        if (days >= 1) return `${days}d`;
        const hours = Math.floor(ms / 3_600_000);
        if (hours >= 1) return `${hours}h`;
        return `${Math.max(1, Math.floor(ms / 60_000))}m`;
      })()
    : "—";

  useEffect(() => {
    if (!isLoading && isLoggedIn) {
      setLocation("/dashboard");
    }
  }, [isLoading, isLoggedIn, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <span className="text-muted-foreground">Loading…</span>
      </div>
    );
  }

  const ease: "linear" | [number, number, number, number] = reduceMotion
    ? "linear"
    : [0.16, 1, 0.3, 1];

  return (
    <div className="relative min-h-dvh w-full overflow-x-hidden bg-background text-foreground">
      {/* Ambient glow — matches Login's centered primary glow */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
        <div className="absolute left-1/2 top-[-15%] h-[800px] w-[800px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute right-[-10%] top-[40%] h-[600px] w-[600px] rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute left-[-10%] bottom-[10%] h-[500px] w-[500px] rounded-full bg-primary/10 blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-20">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:h-20 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex min-h-11 min-w-0 items-center gap-3 rounded-full pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Football Kickoff 2026 home"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/20 p-2 shadow-[0_0_20px_-5px_rgba(24,165,88,0.5)] sm:h-12 sm:w-12">
              <img src={yesfamLogo} alt="YesFam India" className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-extrabold leading-none tracking-tight text-white sm:text-xl">
                Football Kickoff 2026
              </p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                YesFam India · Collabrix Zone
              </p>
            </div>
          </Link>
          <Button
            asChild
            className="min-h-11 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground shadow-[0_0_30px_-8px_rgba(24,165,88,0.6)] transition-all hover:bg-primary/90 hover:shadow-[0_0_40px_-6px_rgba(24,165,88,0.8)] sm:min-h-12"
          >
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="relative z-10">
        {/* HERO */}
        <section className="w-full px-4 pb-20 pt-8 sm:px-6 sm:pt-12 lg:px-8 lg:pb-28">
          <div className="mx-auto w-full max-w-7xl">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease }}
              className="mx-auto max-w-4xl text-center"
            >
              {/* Kicker pill */}
              <div className="mx-auto mb-7 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-primary backdrop-blur-sm">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                FIFA World Cup 2026 · YesFam Edition
              </div>

              <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl xl:text-8xl">
                Predict the score.
                <br />
                <span className="text-primary">Win the table.</span>
              </h1>

              <p className="mx-auto mt-7 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg lg:text-xl">
                Private prediction league for the YesFam crew. Two numbers per match,
                fifteen-minute lock, live points, one pizza waiting for whoever ends
                the tournament on top.
              </p>

              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button
                  asChild
                  className="group min-h-12 rounded-full bg-primary px-8 text-base font-bold text-primary-foreground shadow-[0_0_40px_-8px_rgba(24,165,88,0.7)] transition-all hover:scale-[1.02] hover:bg-primary/90 hover:shadow-[0_0_60px_-6px_rgba(24,165,88,0.9)] sm:min-h-14"
                >
                  <Link href="/login">
                    Join the league
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </Link>
                </Button>
                <Link
                  href="/login"
                  className="group inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-white sm:min-h-14"
                >
                  Already in? <span className="text-white">Sign in</span>
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </Link>
              </div>

              {/* KPI strip */}
              <dl className="mx-auto mt-12 grid max-w-3xl grid-cols-3 gap-3 sm:gap-4">
                {[
                  { value: leaderboardQ.isLoading ? "…" : String(playerCount), label: "Active players" },
                  { value: "15m", label: "Lock window" },
                  { value: matchesQ.isLoading ? "…" : nextDeadline, label: "Next deadline" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-border bg-card/60 p-4 backdrop-blur-sm transition-colors hover:border-primary/40 sm:p-5"
                  >
                    <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      {item.label}
                    </dt>
                    <dd className="mt-1.5 text-2xl font-extrabold tracking-tight tabular-nums text-white sm:text-3xl">
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </motion.div>
          </div>
        </section>

        {/* MATCH PREVIEW + LEADERBOARD — community showcase */}
        <section className="w-full px-4 pb-20 sm:px-6 lg:px-8 lg:pb-28">
          <div className="mx-auto grid w-full max-w-7xl gap-5 lg:grid-cols-[1.3fr_1fr] lg:gap-6">
            {/* Featured fixtures card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, ease }}
              className="relative overflow-hidden rounded-3xl border border-border bg-card/80 p-6 shadow-2xl backdrop-blur-sm sm:p-8"
            >
              {(() => {
                const now = Date.now();
                const nextMs = nextKickoff ? new Date(nextKickoff).getTime() : 0;
                const diff = nextMs - now;
                const isLive = openMatches.some((m) => {
                  const ko = new Date(m.kickoffTime).getTime();
                  return ko <= now && ko + 2.5 * 60 * 60 * 1000 >= now;
                });
                const isToday = diff > 0 && diff < 24 * 60 * 60 * 1000;
                const heading = isLive
                  ? "Live now"
                  : isToday
                    ? "Tonight & up next"
                    : "Next up";
                let chipLabel = "Scheduled";
                let chipLive = false;
                if (isLive) {
                  chipLabel = "Live";
                  chipLive = true;
                } else if (diff > 0) {
                  const days = Math.floor(diff / 86_400_000);
                  const hours = Math.floor(diff / 3_600_000);
                  chipLabel = days >= 1 ? `T-${days}d` : hours >= 1 ? `T-${hours}h` : `T-${Math.max(1, Math.floor(diff / 60_000))}m`;
                }
                return (
                  <div className="mb-6 flex items-end justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                        Match centre
                      </p>
                      <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                        {heading}
                      </h2>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-primary tabular-nums">
                      {chipLive && (
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" aria-hidden="true" />
                      )}
                      {chipLabel}
                    </span>
                  </div>
                );
              })()}

              {matchesQ.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading fixtures…</p>
              ) : openMatches.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-background/30 p-8 text-center">
                  <p className="text-base font-extrabold tracking-tight text-white">No open fixtures yet</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Sit tight — kickoffs land as soon as the schedule confirms.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {openMatches.map((m) => (
                    <li
                      key={m.id}
                      className="group flex items-center gap-4 rounded-2xl border border-border bg-background/50 p-4 transition-all hover:border-primary/40 hover:bg-background/80 sm:p-5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-extrabold tracking-tight text-white sm:text-lg">
                          {m.teamA?.name ?? "TBD"} <span className="text-muted-foreground/60">vs</span> {m.teamB?.name ?? "TBD"}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                            {formatKickoff(m.kickoffTime)}
                          </span>
                          {m.round && (
                            <>
                              <span className="hidden sm:inline">·</span>
                              <span>{m.round}</span>
                            </>
                          )}
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-primary" aria-hidden="true" />
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>

            {/* Live leaderboard card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.55, delay: 0.08, ease }}
              className="relative overflow-hidden rounded-3xl border border-border bg-card/80 p-6 shadow-2xl backdrop-blur-sm sm:p-8"
            >
              <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                    Standings
                  </p>
                  <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                    Top of the table
                  </h2>
                </div>
                <Crown className="h-7 w-7 text-primary" aria-hidden="true" />
              </div>

              {leaderboardQ.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading standings…</p>
              ) : top3.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-background/30 p-8 text-center">
                  <p className="text-base font-extrabold tracking-tight text-white">No predictions yet</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Be the first to call a score. Top of the table starts empty.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {top3.map((p, idx) => {
                    const rank = idx + 1;
                    return (
                      <li
                        key={p.userId}
                        className="flex items-center gap-3 rounded-2xl border border-border bg-background/50 p-4 sm:gap-4"
                      >
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold tabular-nums ${
                            rank === 1
                              ? "bg-primary text-primary-foreground shadow-[0_0_20px_-4px_rgba(24,165,88,0.7)]"
                              : "border border-border bg-background text-muted-foreground"
                          }`}
                        >
                          {rank}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-extrabold tracking-tight text-white sm:text-base">{p.displayName}</p>
                          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                            {p.exactScores ?? 0} exact
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-2xl font-extrabold tabular-nums text-primary sm:text-3xl">{p.totalPoints}</p>
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">pts</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </motion.div>
          </div>
        </section>

        {/* SCORING TABLE */}
        <section className="w-full px-4 pb-20 sm:px-6 lg:px-8 lg:pb-28">
          <div className="mx-auto w-full max-w-7xl">
            <div className="mx-auto mb-10 max-w-3xl text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                Scoring system
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
                Points land the moment results post.
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                Predictions score against the regulation 90-minute result.
                Extra time and penalty picks earn bonus points but never replace the base ninety.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {scoring.map((s, idx) => (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.4, delay: idx * 0.06, ease }}
                  className="relative overflow-hidden rounded-3xl border border-border bg-card/80 p-6 text-center shadow-2xl backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-primary/40 sm:p-8"
                >
                  <p className="text-5xl font-extrabold tabular-nums text-primary sm:text-6xl">
                    +{s.points}
                  </p>
                  <p className="mt-3 text-sm font-bold uppercase tracking-[0.14em] text-white sm:text-base">
                    {s.label}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="w-full px-4 pb-20 sm:px-6 lg:px-8 lg:pb-28">
          <div className="mx-auto w-full max-w-7xl">
            <div className="mb-10">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                Built for match night
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
                Fast picks. Loud chats.
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
              {features.map((f, idx) => (
                <motion.article
                  key={f.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.45, delay: idx * 0.06, ease }}
                  className="group relative overflow-hidden rounded-3xl border border-border bg-card/80 p-6 shadow-2xl backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-primary/40 sm:p-7"
                >
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 shadow-[0_0_20px_-6px_rgba(24,165,88,0.5)]">
                    <f.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  </div>
                  <h3 className="text-lg font-extrabold tracking-tight text-white">{f.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{f.desc}</p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        {/* PRIZE BLOCK */}
        <section className="w-full px-4 pb-20 sm:px-6 lg:px-8 lg:pb-28">
          <div className="mx-auto w-full max-w-7xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, ease }}
              className="relative overflow-hidden rounded-3xl border border-primary/30 bg-card/80 p-8 shadow-2xl backdrop-blur-sm sm:p-12 lg:p-16"
            >
              <div
                className="pointer-events-none absolute inset-0"
                aria-hidden="true"
                style={{
                  background:
                    "radial-gradient(circle at 80% 20%, rgba(24,165,88,0.25), transparent 50%), radial-gradient(circle at 10% 90%, rgba(24,165,88,0.15), transparent 50%)",
                }}
              />
              <div className="relative grid items-center gap-8 lg:grid-cols-[1fr_auto]">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">
                    <Pizza className="h-3.5 w-3.5" aria-hidden="true" />
                    The prize
                  </div>
                  <h2 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                    Winner eats pizza. Loser pays.
                  </h2>
                  <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                    Finish on top of the final tournament table and the crew picks up the tab.
                    Bragging rights last till the next World Cup.
                  </p>
                </div>
                <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-full bg-primary/15 shadow-[0_0_60px_-10px_rgba(24,165,88,0.8)] sm:h-40 sm:w-40">
                  <Pizza className="h-16 w-16 text-primary sm:h-20 sm:w-20" aria-hidden="true" />
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="w-full px-4 pb-24 sm:px-6 lg:px-8 lg:pb-32">
          <div className="mx-auto max-w-3xl text-center">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, ease }}
            >
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 shadow-[0_0_30px_-6px_rgba(24,165,88,0.7)]">
                <Sparkles className="h-6 w-6 text-primary" aria-hidden="true" />
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
                Get your picks in.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                Sixty seconds to sign up. Two numbers per match. One leaderboard, one pizza.
              </p>
              <div className="mt-8 flex justify-center">
                <Button
                  asChild
                  className="group min-h-14 rounded-full bg-primary px-10 text-base font-bold text-primary-foreground shadow-[0_0_60px_-8px_rgba(24,165,88,0.8)] transition-all hover:scale-[1.02] hover:bg-primary/90"
                >
                  <Link href="/login">
                    Sign me up
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/50 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-sm font-extrabold tracking-tight text-white">
            Football Kickoff <span className="text-primary">2026</span>
          </p>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            A <span className="text-white">YesFam India</span> tradition · Built by{" "}
            <a
              href="https://thecollabrix.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              data-testid="link-collabrix-landing"
            >
              Collabrix Zone
            </a>
          </p>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Synced live
          </div>
        </div>
      </footer>
    </div>
  );
}
