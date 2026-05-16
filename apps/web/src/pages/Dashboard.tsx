import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Trophy, Target, CheckCircle2, ChevronRight, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useGetMyStats,
  useListMatches,
  getListMatchesQueryKey,
  type MatchWithPrediction,
} from "@workspace/api-client-react";
import { TOURNAMENT_SLUG } from "@/lib/constants";
import { QuickPredictCard } from "@/components/QuickPredictCard";
import { MatchDetailDialog } from "@/components/MatchDetailDialog";
import { PizzaPrize } from "@/components/PizzaPrize";
import { useGetLeaderboard } from "@workspace/api-client-react";

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function Dashboard() {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const [, setLocation] = useLocation();
  // Admins don't have a personal dashboard — every admin surface lives on
  // /admin (overview, fixtures, users, approvals). Send them straight there.
  useEffect(() => {
    if (isAdmin) setLocation("/admin");
  }, [isAdmin, setLocation]);
  const stats = useGetMyStats({ tournamentSlug: TOURNAMENT_SLUG });
  const lb = useGetLeaderboard(TOURNAMENT_SLUG, { filter: "overall" });
  const leader = lb.data?.[0];
  // Refetch every 30s so the auto-synced fixtures show up without a manual refresh.
  const matches = useListMatches(TOURNAMENT_SLUG, { status: "open" }, {
    query: {
      queryKey: getListMatchesQueryKey(TOURNAMENT_SLUG, { status: "open" }),
      refetchInterval: 30 * 1000,
    },
  });

  const [openMatch, setOpenMatch] = useState<MatchWithPrediction | null>(null);

  const allOpen = (matches.data ?? [])
    .filter((m) => m.status === "open")
    .sort((a, b) => new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime());

  // "Today" = matches kicking off in the user's local calendar day. Falls back
  // to the next 1–3 upcoming matches if nothing is scheduled today, so the
  // dashboard always has something actionable.
  const today = new Date();
  const todaysMatches = allOpen.filter((m) =>
    isSameLocalDay(new Date(m.kickoffTime), today),
  );
  const showingToday = todaysMatches.length > 0;
  const upcoming = showingToday ? todaysMatches.slice(0, 3) : allOpen.slice(0, 3);
  const nextLater = !showingToday && allOpen.length > 0 ? allOpen[0] : null;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-primary mb-3">
            <Flame className="w-3 h-3" />
            {isAdmin ? "Admin view" : "Match day"}
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            {isAdmin
              ? `Hey ${currentUser?.name.split(" ")[0]}, here's the league.`
              : `Hey ${currentUser?.name.split(" ")[0]}, ready for kickoff?`}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isAdmin
              ? "You're not in the standings — manage matches, results, and approvals."
              : "Submit your predictions before the matches lock."}
          </p>
        </div>
        <Button asChild size="lg" className="font-bold shadow-[0_0_20px_-5px_rgba(24,165,88,0.5)]">
          <Link
            href={isAdmin ? "/admin" : "/predictions"}
            data-testid={isAdmin ? "button-admin-panel" : "button-predict-now"}
          >
            {isAdmin ? "Open admin panel" : "All Predictions"}
          </Link>
        </Button>
      </div>

      {!isAdmin && (
        <PizzaPrize
          variant="banner"
          leaderName={leader?.displayName ?? null}
          leaderPoints={leader?.totalPoints ?? null}
        />
      )}

      {!isAdmin && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={<Trophy className="text-yellow-400" />}
            label="Rank"
            value={stats.data?.rank != null ? `#${stats.data.rank}` : "—"}
          />
          <StatCard
            icon={<Target className="text-primary" />}
            label="Total Points"
            value={(stats.data?.totalPoints ?? 0).toString()}
          />
          <StatCard
            icon={<CheckCircle2 className="text-blue-400" />}
            label="Exact Scores"
            value={(stats.data?.exactScores ?? 0).toString()}
          />
          <StatCard
            icon={<CheckCircle2 className="text-green-400" />}
            label="Correct Results"
            value={(stats.data?.correctResults ?? 0).toString()}
          />
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">
              {showingToday ? "Today's matches" : "Coming up next"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {showingToday
                ? "Lock your scores before the whistle. Tap a card for team form and to predict."
                : nextLater
                  ? `No matches today. Next kickoff ${new Date(nextLater.kickoffTime).toLocaleString(undefined, { weekday: "long", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}.`
                  : "We'll fetch the next ones automatically."}
            </p>
          </div>
          <Link
            href={isAdmin ? "/admin" : "/predictions"}
            className="text-sm font-medium text-primary hover:text-primary/80 flex items-center whitespace-nowrap"
          >
            {isAdmin ? "Manage" : "See all"} <ChevronRight className="w-4 h-4 ml-1" />
          </Link>
        </div>
        {matches.isLoading ? (
          <p className="text-muted-foreground">Loading matches…</p>
        ) : upcoming.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground">
            No open matches right now. We'll fetch the next ones automatically.
          </div>
        ) : isAdmin ? (
          // Admin view: read-only fixture list. No popup, no predict form;
          // tap a row to jump straight to the admin panel for result entry.
          <div className="space-y-3">
            {upcoming.map((m) => (
              <Link
                key={m.id}
                href="/admin"
                className="block bg-card/80 backdrop-blur-sm border border-border rounded-2xl p-4 sm:p-5 flex items-center gap-4 transition-colors hover:border-primary/40"
                data-testid={`admin-fixture-${m.id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-extrabold tracking-tight text-white sm:text-lg">
                    {m.teamA?.name ?? "TBD"}{" "}
                    <span className="text-muted-foreground/60">vs</span>{" "}
                    {m.teamB?.name ?? "TBD"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(m.kickoffTime).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })} IST · {m.round}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {/* The very next match gets the big primary card with countdown. */}
            <QuickPredictCard
              match={upcoming[0]}
              primary
              onOpenDetails={() => setOpenMatch(upcoming[0])}
            />
            {upcoming.length > 1 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {upcoming.slice(1).map((m) => (
                  <QuickPredictCard
                    key={m.id}
                    match={m}
                    onOpenDetails={() => setOpenMatch(m)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <MatchDetailDialog
        match={openMatch}
        open={openMatch != null}
        onOpenChange={(v) => !v && setOpenMatch(null)}
      />
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card/80 backdrop-blur-sm border border-border rounded-3xl p-5 flex flex-col items-start gap-3 shadow-2xl"
    >
      <div className="p-2 bg-background rounded-lg border border-border">{icon}</div>
      <div>
        <p className="text-sm text-muted-foreground font-medium">{label}</p>
        <p className="text-2xl font-bold text-white mt-1">{value}</p>
      </div>
    </motion.div>
  );
}
