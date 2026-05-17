import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  useGetAdminOverview,
  useListAdminUsers,
  useListMatches,
  getListMatchesQueryKey,
  useRecalculateMatch,
  useEnterMatchResult,
  useSyncFixtures,
  useSyncScores,
  useGetPaymentSettings,
  useUpdatePaymentSettings,
  useListPendingPayments,
  useListPendingIdentities,
  useDecideUserPayment,
  useDecideUserIdentity,
  useBanUser,
  useUnbanUser,
  useSetUserName,
  useGetTournament,
  useSetTournamentRules,
  getListAdminUsersQueryKey,
  getGetTournamentQueryKey,
  ApiError,
  type PendingPayment,
  type PendingIdentity,
  type PaymentSettings,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { useRef, useState } from "react";
import { TOURNAMENT_SLUG } from "@/lib/constants";
import {
  Shield,
  Users,
  ClipboardList,
  CalendarClock,
  Lock,
  CheckCircle2,
  Activity,
  AlertTriangle,
  Calculator,
  Zap,
  Mail,
  Crown,
  UserCheck,
  UserX,
  Banknote,
  ShieldCheck,
  Image as ImageIcon,
  Upload,
  Ban,
  RotateCcw,
  Edit3,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function Admin() {
  const { currentUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const overview = useGetAdminOverview({ tournamentSlug: TOURNAMENT_SLUG });
  // Live polling so live scores from the football-data sync land here
  // without a manual refresh.
  const matches = useListMatches(TOURNAMENT_SLUG, undefined, {
    query: {
      queryKey: getListMatchesQueryKey(TOURNAMENT_SLUG),
      refetchInterval: 30_000,
    },
  });
  const users = useListAdminUsers({ tournamentSlug: TOURNAMENT_SLUG });
  const recalc = useRecalculateMatch();
  const syncFixtures = useSyncFixtures();
  const syncScores = useSyncScores();

  useEffect(() => {
    if (currentUser && currentUser.role !== "admin") {
      setLocation("/dashboard");
    }
  }, [currentUser, setLocation]);

  if (currentUser?.role !== "admin") return null;

  const completed = (matches.data ?? []).filter((m) => m.status === "completed");

  const runWith = async <T,>(
    label: string,
    fn: () => Promise<T>,
    onSuccess: (r: T) => { title: string; description?: string },
  ) => {
    try {
      const r = await fn();
      const msg = onSuccess(r);
      toast(msg);
      await queryClient.invalidateQueries();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : `${label} failed.`;
      toast({ title: `${label} failed`, description: message, variant: "destructive" });
    }
  };

  const handleSyncFixtures = () =>
    runWith(
      "Fixture sync",
      () => syncFixtures.mutateAsync({ data: { tournamentSlug: TOURNAMENT_SLUG } }),
      (r) => ({
        title: `Pulled ${r.competition} schedule`,
        description: `Created ${r.matchesCreated}, updated ${r.matchesUpdated}, teams +${r.teamsCreated}/linked ${r.teamsLinked}.${r.errors.length ? ` Errors: ${r.errors.slice(0, 2).join("; ")}` : ""}`,
      }),
    );

  const handleSyncScores = () =>
    runWith(
      "Score sync",
      () => syncScores.mutateAsync({ data: { tournamentSlug: TOURNAMENT_SLUG } }),
      (r) => ({
        title: r.matchesUpdated === 0 ? "Nothing to update" : `Updated ${r.matchesUpdated} matches`,
        description: `Completed: ${r.matchesCompleted}, predictions auto-scored: ${r.predictionsScored}.${r.errors.length ? ` Errors: ${r.errors.slice(0, 2).join("; ")}` : ""}`,
      }),
    );

  const handleRecalcAll = async () => {
    if (completed.length === 0) {
      toast({ title: "No completed matches to recalculate." });
      return;
    }
    try {
      for (const m of completed) {
        await recalc.mutateAsync({ id: m.id });
      }
      toast({ title: `Recalculated ${completed.length} matches.` });
      await queryClient.invalidateQueries();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Recalculate failed.";
      toast({ title: "Recalculate failed", description: message, variant: "destructive" });
    }
  };

  const o = overview.data;
  const isAnythingPending = syncFixtures.isPending || syncScores.isPending || recalc.isPending;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8 pb-24">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-500/10 via-card to-card p-6 md:p-8"
      >
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-red-400 uppercase tracking-wider mb-2">
              <Shield className="w-3.5 h-3.5" /> Admin Control
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
              Everything's on autopilot.
            </h1>
            <p className="text-muted-foreground mt-2 max-w-xl text-sm">
              Fixtures, live scores and prediction scoring all run automatically. This panel is here
              for visibility and rare emergency overrides.
            </p>
          </div>
          <AutomationStatus pending={isAnythingPending} />
        </div>
      </motion.section>

      {/* Stat grid — split into Players + Matches sections */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StatGroup
          title="Community"
          subtitle="Who's in and how active they are."
          icon={<Users className="w-4 h-4 text-blue-400" />}
        >
          <Stat
            label="Active players"
            value={o?.totalParticipants ?? 0}
            icon={<Users className="w-4 h-4" />}
            tone="primary"
          />
          <Stat
            label="Total accounts"
            value={o?.totalUsers ?? 0}
            icon={<Users className="w-4 h-4" />}
          />
          <Stat
            label="Predictions made"
            value={o?.totalPredictions ?? 0}
            icon={<ClipboardList className="w-4 h-4" />}
          />
          <Stat
            label="Missing preds"
            value={o?.missingPredictions ?? 0}
            icon={<AlertTriangle className="w-4 h-4" />}
            tone={(o?.missingPredictions ?? 0) > 0 ? "yellow" : undefined}
          />
        </StatGroup>

        <StatGroup
          title="Match pipeline"
          subtitle="How fixtures are flowing through the tournament."
          icon={<CalendarClock className="w-4 h-4 text-purple-400" />}
        >
          <Stat
            label="Open"
            value={o?.openMatches ?? 0}
            icon={<CalendarClock className="w-4 h-4" />}
            tone="yellow"
          />
          <Stat
            label="Locked"
            value={o?.lockedMatches ?? 0}
            icon={<Lock className="w-4 h-4" />}
            tone="red"
          />
          <Stat
            label="Completed"
            value={o?.completedMatches ?? 0}
            icon={<CheckCircle2 className="w-4 h-4" />}
            tone="green"
          />
          <Stat
            label="Total fixtures"
            value={o?.totalMatches ?? 0}
            icon={<CalendarClock className="w-4 h-4" />}
          />
        </StatGroup>
      </section>

      {/* Fixtures table — full FIFA schedule from football-data.org with
          live scores refreshed every 30 s. */}
      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary/80">
              Fixtures
            </p>
            <h2 className="text-xl md:text-2xl font-extrabold text-white tracking-tight mt-1">
              World Cup schedule
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              All matches synced from football-data.org. Scores update live.
            </p>
          </div>
          <span className="text-xs text-muted-foreground font-mono shrink-0">
            {matches.data?.length ?? 0} fixtures
          </span>
        </div>
        <FixturesTable rows={matches.data ?? []} loading={matches.isLoading} />
      </section>

      {/* Members shortcut — full user management lives on /admin/users. */}
      <section>
        <a
          href="/admin/users"
          className="flex items-center justify-between gap-4 bg-card border border-border rounded-2xl p-5 hover:border-primary/40 transition-colors"
          data-testid="link-admin-users"
        >
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary/80">
              Members
            </p>
            <h2 className="text-lg md:text-xl font-extrabold text-white tracking-tight mt-1">
              {users.data?.length ?? 0} registered users
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Edit display names, ban or unban players, review participation →
            </p>
          </div>
          <Users className="w-6 h-6 text-primary shrink-0" />
        </a>
      </section>

      {/* Editable tournament rules markdown */}
      <RulesEditorCard />

      {/* Verification queues */}
      <section className="space-y-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-primary/80">Verification</p>
          <h2 className="text-xl md:text-2xl font-extrabold text-white tracking-tight mt-1">
            Approve players
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Review uploaded UPI screenshots and selfies, then approve or reject. Approved players
            unlock predictions immediately.
          </p>
        </div>
        <UpiSettingsCard />
        <PendingPaymentsCard />
        <PendingIdentitiesCard />
      </section>

      {/* Manual overrides */}
      <section>
        <div className="mb-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-primary/80">
            Emergency overrides
          </p>
          <h2 className="text-xl md:text-2xl font-extrabold text-white tracking-tight mt-1">
            Force a sync
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Live scores auto-sync every <strong className="text-white">2 minutes</strong>;
            fixtures every <strong className="text-white">6 hours</strong>. Use these only when
            you need to skip the wait.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ActionCard
            icon={<CalendarClock className="w-5 h-5" />}
            title="Sync fixtures"
            description="Pull the latest schedule, teams, and kickoff times from the official feed."
            actionLabel={syncFixtures.isPending ? "Syncing fixtures…" : "Run fixture sync"}
            onClick={handleSyncFixtures}
            disabled={syncFixtures.isPending}
            tone="blue"
            testId="button-sync-fixtures"
          />
          <ActionCard
            icon={<Zap className="w-5 h-5" />}
            title="Sync live scores"
            description="Pull current scores including extra time and penalty shootouts. Auto-scores predictions."
            actionLabel={syncScores.isPending ? "Syncing scores…" : "Run score sync"}
            onClick={handleSyncScores}
            disabled={syncScores.isPending}
            tone="green"
            testId="button-sync-scores"
          />
          <ActionCard
            icon={<Calculator className="w-5 h-5" />}
            title="Recalculate points"
            description={`Re-runs scoring for all ${completed.length} completed match${completed.length === 1 ? "" : "es"}. Use after rule changes.`}
            actionLabel={recalc.isPending ? "Recalculating…" : "Recalculate all"}
            onClick={handleRecalcAll}
            disabled={recalc.isPending || completed.length === 0}
            tone="muted"
            testId="button-recalc-all"
          />
        </div>
      </section>
    </div>
  );
}

// Full World Cup fixture table for the admin view. Pulls every match in
// the tournament (synced from football-data.org), shows live scores +
// status + IST kickoff, and offers an inline "Enter result" prompt for
// matches that haven't completed yet.
function FixturesTable({
  rows,
  loading,
}: {
  rows: import("@workspace/api-client-react").MatchWithPrediction[];
  loading: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const enterResult = useEnterMatchResult();

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground">
        Loading fixtures…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground">
        No fixtures synced yet. Use "Sync fixtures" in the overrides section
        below to pull from football-data.org.
      </div>
    );
  }

  const sorted = rows
    .slice()
    .sort((a, b) => new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime());

  async function handleEnterResult(matchId: number, label: string, currentA: number | null | undefined, currentB: number | null | undefined) {
    const raw = window.prompt(
      `Enter regulation 90-min score for:\n${label}\n\nFormat: A-B (e.g. 2-1)`,
      currentA != null && currentB != null ? `${currentA}-${currentB}` : "",
    );
    if (!raw) return;
    const m = raw.trim().match(/^(\d+)\s*[-:]\s*(\d+)$/);
    if (!m) {
      toast({ title: "Invalid format", description: "Use A-B (e.g. 2-1)", variant: "destructive" });
      return;
    }
    const scoreA = Number(m[1]);
    const scoreB = Number(m[2]);
    try {
      await enterResult.mutateAsync({ id: matchId, data: { scoreA, scoreB } });
      toast({ title: `Result saved: ${scoreA}-${scoreB}` });
      await queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey(TOURNAMENT_SLUG) });
    } catch (err) {
      toast({
        title: "Save failed",
        variant: "destructive",
        description: err instanceof ApiError ? err.message : String(err),
      });
    }
  }

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-background/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">Kickoff (IST)</th>
              <th className="text-left px-4 py-3">Round</th>
              <th className="text-left px-4 py-3">Match</th>
              <th className="text-center px-4 py-3">Score</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((m) => {
              const label = `${m.teamA?.name ?? "TBD"} vs ${m.teamB?.name ?? "TBD"}`;
              const hasScore = m.scoreA != null && m.scoreB != null;
              return (
                <tr key={m.id} className="hover:bg-white/[0.02]" data-testid={`fixture-row-${m.id}`}>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
                    {new Date(m.kickoffTime).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{m.round || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="font-bold text-white">{m.teamA?.name ?? "TBD"}</span>
                    <span className="text-muted-foreground/60"> vs </span>
                    <span className="font-bold text-white">{m.teamB?.name ?? "TBD"}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {hasScore ? (
                      <span className="font-mono font-bold text-white">
                        {m.scoreA}<span className="text-muted-foreground/60"> – </span>{m.scoreB}
                        {m.duration === "EXTRA_TIME" && (
                          <span className="ml-2 text-[10px] uppercase text-amber-400">AET</span>
                        )}
                        {m.duration === "PENALTY_SHOOTOUT" && (
                          <span className="ml-2 text-[10px] uppercase text-amber-400">
                            {m.penaltiesScoreA}-{m.penaltiesScoreB} pens
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleEnterResult(m.id, label, m.scoreA, m.scoreB)}
                      disabled={enterResult.isPending}
                      className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-bold text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-50"
                      data-testid={`btn-enter-result-${m.id}`}
                    >
                      {m.status === "completed" ? "Edit" : "Enter result"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-border">
        {sorted.map((m) => {
          const label = `${m.teamA?.name ?? "TBD"} vs ${m.teamB?.name ?? "TBD"}`;
          const hasScore = m.scoreA != null && m.scoreB != null;
          return (
            <div key={m.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-white text-sm truncate">{label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
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
                <StatusBadge status={m.status} />
              </div>
              <div className="flex items-center justify-between gap-3">
                {hasScore ? (
                  <span className="font-mono font-bold text-white text-lg">
                    {m.scoreA} – {m.scoreB}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-sm">No score yet</span>
                )}
                <button
                  type="button"
                  onClick={() => handleEnterResult(m.id, label, m.scoreA, m.scoreB)}
                  disabled={enterResult.isPending}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-bold text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-50"
                >
                  {m.status === "completed" ? "Edit" : "Enter result"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Admin-editable markdown for /rules. Live preview on the right; saves
// to the tournament row server-side. Scoring rules below the editor on
// /rules stay hard-coded so admins can't break the leaderboard math.
function RulesEditorCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tournament = useGetTournament(TOURNAMENT_SLUG);
  const setRules = useSetTournamentRules();
  const [draft, setDraft] = useState<string | null>(null);
  const serverValue = tournament.data?.rulesMd ?? "";
  const value = draft ?? serverValue;
  const dirty = draft != null && draft !== serverValue;

  async function save() {
    if (draft == null) return;
    try {
      await setRules.mutateAsync({ slug: TOURNAMENT_SLUG, data: { rulesMd: draft } });
      toast({ title: "Rules updated" });
      setDraft(null);
      await queryClient.invalidateQueries({
        queryKey: getGetTournamentQueryKey(TOURNAMENT_SLUG),
      });
    } catch (err) {
      toast({
        title: "Save failed",
        variant: "destructive",
        description: err instanceof ApiError ? err.message : String(err),
      });
    }
  }

  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-primary/80">
            Announcements
          </p>
          <h2 className="text-xl md:text-2xl font-extrabold text-white tracking-tight mt-1">
            Notes for the /rules page
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Optional markdown shown <em>above</em> the scoring cards on /rules.
            Use it for announcements, prize details, dispute rules, or anything
            tournament-specific. Leave empty to hide. Scoring math is fixed.
          </p>
        </div>
        <Button
          onClick={save}
          disabled={!dirty || setRules.isPending}
          className="font-bold shrink-0"
          data-testid="button-save-rules"
        >
          {setRules.isPending ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Markdown</p>
          <textarea
            value={value}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`# Tournament rules\n\n- Entry fee: 100\n- Lock window: 15 min before kickoff\n- Pizza for the leader\n`}
            spellCheck={false}
            className="w-full h-72 resize-y bg-background border border-border rounded-md p-3 text-sm font-mono leading-6 text-white placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/50"
            data-testid="textarea-rules"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {value.length}/50000 characters
          </p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Preview</p>
          <article className="prose prose-invert prose-sm max-w-none h-72 overflow-y-auto rounded-md border border-border bg-background p-3 prose-headings:text-white prose-strong:text-white prose-a:text-primary">
            {value.trim() ? (
              <ReactMarkdown>{value}</ReactMarkdown>
            ) : (
              <p className="text-muted-foreground italic">Empty — type markdown on the left to see a preview.</p>
            )}
          </article>
        </div>
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: "open" | "locked" | "completed" }) {
  const cls =
    status === "completed"
      ? "border-green-500/40 bg-green-500/10 text-green-300"
      : status === "locked"
        ? "border-red-500/40 bg-red-500/10 text-red-300"
        : "border-blue-500/40 bg-blue-500/10 text-blue-300";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", cls)}>
      {status}
    </span>
  );
}

function UsersTable({
  rows,
  loading,
  currentUserId,
}: {
  rows: import("@workspace/api-client-react").AdminUserRow[];
  loading: boolean;
  currentUserId: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const banUser = useBanUser();
  const unbanUser = useUnbanUser();
  const setUserName = useSetUserName();

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: getListAdminUsersQueryKey({ tournamentSlug: TOURNAMENT_SLUG }),
    });

  async function handleBan(userId: number, name: string) {
    const reason = window.prompt(`Reason for banning ${name}?`);
    if (!reason || !reason.trim()) return;
    try {
      await banUser.mutateAsync({ id: userId, data: { reason: reason.trim() } });
      toast({ title: `${name} banned` });
      await refresh();
    } catch (err) {
      toast({ title: "Ban failed", variant: "destructive", description: err instanceof ApiError ? err.message : String(err) });
    }
  }
  async function handleUnban(userId: number, name: string) {
    try {
      await unbanUser.mutateAsync({ id: userId });
      toast({ title: `${name} unbanned` });
      await refresh();
    } catch (err) {
      toast({ title: "Unban failed", variant: "destructive", description: err instanceof ApiError ? err.message : String(err) });
    }
  }
  async function handleRename(userId: number, current: string) {
    const next = window.prompt(`Set display name for ${current}:`, current);
    if (!next || !next.trim() || next.trim() === current) return;
    try {
      await setUserName.mutateAsync({ id: userId, data: { name: next.trim() } });
      toast({ title: `Renamed to ${next.trim()}` });
      await refresh();
    } catch (err) {
      toast({ title: "Rename failed", variant: "destructive", description: err instanceof ApiError ? err.message : String(err) });
    }
  }

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 text-sm text-muted-foreground">
        Loading users…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 text-sm text-muted-foreground">
        No users yet.
      </div>
    );
  }
  // Newest first — created_at desc.
  const sorted = rows
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-background/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">Player</th>
              <th className="text-left px-4 py-3">Role</th>
              <th className="text-left px-4 py-3">Joined</th>
              <th className="text-right px-4 py-3">Predictions</th>
              <th className="text-right px-4 py-3">Points</th>
              <th className="text-right px-4 py-3">Signed up</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((u) => (
              <tr
                key={u.id}
                className={cn(
                  "hover:bg-white/[0.02] transition-colors",
                  u.id === currentUserId && "bg-primary/5",
                )}
                data-testid={`admin-user-row-${u.id}`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/30 text-primary font-bold flex items-center justify-center shrink-0 text-xs">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-white text-sm flex items-center gap-2">
                        {u.name}
                        {u.id === currentUserId && (
                          <span className="text-[9px] font-bold bg-primary/15 text-primary border border-primary/30 px-1.5 py-0.5 rounded uppercase">
                            you
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <Mail className="w-3 h-3 shrink-0" />
                        <span className="truncate">{u.email}</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <RoleBadge role={u.role} />
                </td>
                <td className="px-4 py-3">
                  <ParticipantBadge isParticipant={u.isParticipant} />
                </td>
                <td className="px-4 py-3 text-right font-mono text-white">
                  {u.predictionsSubmitted}
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-primary">
                  {u.totalPoints}
                </td>
                <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">
                  {new Date(u.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleRename(u.id, u.name)}
                      title="Edit display name"
                      className="rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-50"
                      disabled={setUserName.isPending || u.role === "admin"}
                      data-testid={`btn-rename-${u.id}`}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    {u.banned ? (
                      <button
                        type="button"
                        onClick={() => handleUnban(u.id, u.name)}
                        title={`Unban (was: ${u.banReason ?? "no reason"})`}
                        className="rounded-md border border-amber-500/40 bg-amber-500/10 p-1.5 text-amber-400 hover:bg-amber-500/20 disabled:opacity-50"
                        disabled={unbanUser.isPending}
                        data-testid={`btn-unban-${u.id}`}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleBan(u.id, u.name)}
                        title="Ban user"
                        className="rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
                        disabled={banUser.isPending || u.id === currentUserId || u.role === "admin"}
                        data-testid={`btn-ban-${u.id}`}
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-border">
        {sorted.map((u) => (
          <div
            key={u.id}
            className={cn(
              "p-4 space-y-2",
              u.id === currentUserId && "bg-primary/5",
            )}
            data-testid={`admin-user-card-${u.id}`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/30 text-primary font-bold flex items-center justify-center shrink-0">
                {u.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-white text-sm flex items-center gap-2">
                  {u.name}
                  {u.id === currentUserId && (
                    <span className="text-[9px] font-bold bg-primary/15 text-primary border border-primary/30 px-1.5 py-0.5 rounded uppercase">
                      you
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">{u.email}</div>
              </div>
              <RoleBadge role={u.role} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div className="bg-background/40 border border-border rounded-md py-2">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">Preds</p>
                <p className="font-mono font-bold text-white text-sm">{u.predictionsSubmitted}</p>
              </div>
              <div className="bg-background/40 border border-border rounded-md py-2">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">Points</p>
                <p className="font-mono font-bold text-primary text-sm">{u.totalPoints}</p>
              </div>
              <div className="bg-background/40 border border-border rounded-md py-2 flex items-center justify-center">
                <ParticipantBadge isParticipant={u.isParticipant} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: "user" | "admin" }) {
  if (role === "admin") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-1 rounded-full">
        <Crown className="w-3 h-3" /> Admin
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-muted/30 text-muted-foreground border border-border px-2 py-1 rounded-full">
      Player
    </span>
  );
}

function ParticipantBadge({ isParticipant }: { isParticipant: boolean }) {
  if (isParticipant) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-green-500/10 text-green-400 border border-green-500/30 px-2 py-1 rounded-full">
        <UserCheck className="w-3 h-3" /> Joined
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-muted/30 text-muted-foreground border border-border px-2 py-1 rounded-full">
      <UserX className="w-3 h-3" /> Lurker
    </span>
  );
}

function UpiSettingsCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const settings = useGetPaymentSettings();
  const update = useUpdatePaymentSettings();
  const { uploadFile, isUploading, progress } = useUpload();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<PaymentSettings | null>(null);
  const s = draft ?? settings.data ?? null;

  const setField = <K extends keyof PaymentSettings>(k: K, v: PaymentSettings[K]) => {
    if (!s) return;
    setDraft({ ...s, [k]: v });
  };

  const handleSave = async () => {
    if (!s) return;
    try {
      await update.mutateAsync({
        data: {
          upiId: s.upiId,
          upiDisplayName: s.upiDisplayName,
          qrCodeUrl: s.qrCodeUrl ?? null,
          prizeNote: s.prizeNote ?? null,
          entryFeeAmount: s.entryFeeAmount,
          entryFeeCurrency: s.entryFeeCurrency,
        },
      });
      toast({ title: "Payment settings saved" });
      setDraft(null);
      await queryClient.invalidateQueries();
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof ApiError ? err.message : "Try again",
        variant: "destructive",
      });
    }
  };

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const r = await uploadFile(file);
    if (!r) {
      toast({ title: "Upload failed", variant: "destructive" });
      return;
    }
    setField("qrCodeUrl", r.objectPath);
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
          <Banknote className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="font-bold text-white">UPI settings</h3>
          <p className="text-xs text-muted-foreground">
            What players see on the payment page. Updates apply immediately.
          </p>
        </div>
      </div>

      {settings.isLoading || !s ? (
        <p className="text-sm text-muted-foreground">Loading settings…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <Field label="UPI ID">
              <Input
                value={s.upiId}
                onChange={(e) => setField("upiId", e.target.value)}
                placeholder="yesfam@upi"
                data-testid="input-upi-id"
              />
            </Field>
            <Field label="Display name">
              <Input
                value={s.upiDisplayName}
                onChange={(e) => setField("upiDisplayName", e.target.value)}
                placeholder="YesFam India"
                data-testid="input-upi-name"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Fee">
                <Input
                  type="number"
                  value={s.entryFeeAmount}
                  onChange={(e) => setField("entryFeeAmount", Number(e.target.value) || 0)}
                  data-testid="input-fee-amount"
                />
              </Field>
              <Field label="Currency">
                <Input
                  value={s.entryFeeCurrency}
                  onChange={(e) => setField("entryFeeCurrency", e.target.value.toUpperCase().slice(0, 3))}
                  data-testid="input-fee-currency"
                />
              </Field>
            </div>
            <Field label="Prize note (optional)">
              <Input
                value={s.prizeNote ?? ""}
                onChange={(e) => setField("prizeNote", e.target.value || null)}
                placeholder="e.g. Top scorer wins a pizza from YesFam India"
                data-testid="input-prize-note"
              />
            </Field>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">QR code</p>
            <div className="flex items-start gap-4">
              {s.qrCodeUrl ? (
                <img
                  src={s.qrCodeUrl}
                  alt="UPI QR"
                  className="w-32 h-32 bg-white rounded-lg border border-border object-contain p-2"
                  data-testid="img-admin-qr"
                />
              ) : (
                <div className="w-32 h-32 rounded-lg border border-dashed border-border flex flex-col items-center justify-center text-muted-foreground text-xs gap-1 p-2 text-center">
                  <ImageIcon className="w-5 h-5" />
                  No QR yet
                </div>
              )}
              <div className="flex-1">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleQrUpload}
                  data-testid="input-qr-file"
                />
                <Button
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={isUploading}
                  className="w-full"
                  data-testid="button-upload-qr"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {isUploading ? `Uploading… ${progress}%` : s.qrCodeUrl ? "Replace QR" : "Upload QR"}
                </Button>
                <p className="text-[11px] text-muted-foreground mt-2">
                  PNG/JPG. Players see this on the entry-fee page.
                </p>
              </div>
            </div>
          </div>

          <div className="md:col-span-2 flex justify-end gap-2 pt-2">
            {draft && (
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Discard
              </Button>
            )}
            <Button
              onClick={handleSave}
              disabled={!draft || update.isPending}
              data-testid="button-save-payment-settings"
            >
              {update.isPending ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function PendingPaymentsCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const list = useListPendingPayments();
  const decide = useDecideUserPayment();
  const [notesById, setNotesById] = useState<Record<number, string>>({});

  const act = async (row: PendingPayment, decision: "approve" | "reject") => {
    try {
      await decide.mutateAsync({
        id: row.userId,
        data: { decision, notes: notesById[row.userId] ?? "" },
      });
      toast({
        title: decision === "approve" ? `Approved ${row.name}` : `Rejected ${row.name}`,
      });
      await queryClient.invalidateQueries();
      setNotesById((m) => ({ ...m, [row.userId]: "" }));
    } catch (err) {
      toast({
        title: "Decision failed",
        description: err instanceof ApiError ? err.message : "Try again",
        variant: "destructive",
      });
    }
  };

  const rows = list.data ?? [];

  return (
    <div className="bg-card border border-border rounded-2xl p-5 md:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <Banknote className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h3 className="font-bold text-white">Pending payments</h3>
            <p className="text-xs text-muted-foreground">UPI screenshots awaiting your review.</p>
          </div>
        </div>
        <span className="text-xs font-mono text-muted-foreground">{rows.length} waiting</span>
      </div>

      {list.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pending payments. You're all caught up.</p>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <div
              key={row.userId}
              className="flex flex-col md:flex-row gap-4 p-4 rounded-xl bg-background border border-border"
              data-testid={`pending-payment-${row.userId}`}
            >
              <a href={row.paymentScreenshotUrl} target="_blank" rel="noreferrer" className="shrink-0">
                <img
                  src={row.paymentScreenshotUrl}
                  alt={`${row.name} screenshot`}
                  className="w-32 h-32 object-cover rounded-lg border border-border bg-slate-900"
                />
              </a>
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div>
                  <p className="font-bold text-white">{row.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{row.email}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Submitted {new Date(row.paymentSubmittedAt).toLocaleString()}
                  </p>
                </div>
                <Input
                  value={notesById[row.userId] ?? ""}
                  onChange={(e) => setNotesById((m) => ({ ...m, [row.userId]: e.target.value }))}
                  placeholder="Optional note (shown to player on rejection)"
                  className="text-sm"
                  data-testid={`input-payment-note-${row.userId}`}
                />
                <div className="flex gap-2">
                  <Button
                    onClick={() => act(row, "approve")}
                    disabled={decide.isPending}
                    className="flex-1"
                    data-testid={`button-approve-payment-${row.userId}`}
                  >
                    <UserCheck className="w-4 h-4 mr-2" /> Approve
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => act(row, "reject")}
                    disabled={decide.isPending}
                    className="flex-1"
                    data-testid={`button-reject-payment-${row.userId}`}
                  >
                    <UserX className="w-4 h-4 mr-2" /> Reject
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PendingIdentitiesCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const list = useListPendingIdentities();
  const decide = useDecideUserIdentity();
  const [notesById, setNotesById] = useState<Record<number, string>>({});

  const act = async (row: PendingIdentity, decision: "approve" | "reject") => {
    try {
      await decide.mutateAsync({
        id: row.userId,
        data: { decision, notes: notesById[row.userId] ?? "" },
      });
      toast({
        title: decision === "approve" ? `Verified ${row.name}` : `Rejected ${row.name}`,
      });
      await queryClient.invalidateQueries();
      setNotesById((m) => ({ ...m, [row.userId]: "" }));
    } catch (err) {
      toast({
        title: "Decision failed",
        description: err instanceof ApiError ? err.message : "Try again",
        variant: "destructive",
      });
    }
  };

  const rows = list.data ?? [];

  return (
    <div className="bg-card border border-border rounded-2xl p-5 md:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/30">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h3 className="font-bold text-white">Pending identities</h3>
            <p className="text-xs text-muted-foreground">Selfies awaiting verification.</p>
          </div>
        </div>
        <span className="text-xs font-mono text-muted-foreground">{rows.length} waiting</span>
      </div>

      {list.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No identity reviews pending.</p>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <div
              key={row.userId}
              className="flex flex-col md:flex-row gap-4 p-4 rounded-xl bg-background border border-border"
              data-testid={`pending-identity-${row.userId}`}
            >
              <div className="flex gap-3 shrink-0">
                <div className="flex flex-col items-center gap-1">
                  <a href={row.identityPhotoUrl} target="_blank" rel="noreferrer">
                    <img
                      src={row.identityPhotoUrl}
                      alt={`${row.name} selfie`}
                      className="w-28 h-28 object-cover rounded-lg border border-border bg-slate-900"
                    />
                  </a>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Selfie</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  {row.avatarUrl ? (
                    <a href={row.avatarUrl} target="_blank" rel="noreferrer">
                      <img
                        src={row.avatarUrl}
                        alt={`${row.name} avatar`}
                        className="w-28 h-28 object-cover rounded-lg border border-border bg-slate-900"
                      />
                    </a>
                  ) : (
                    <div className="w-28 h-28 rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground text-[10px] text-center p-2">
                      No profile photo
                    </div>
                  )}
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Avatar</span>
                </div>
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div>
                  <p className="font-bold text-white">{row.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{row.email}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Submitted {new Date(row.identitySubmittedAt).toLocaleString()}
                  </p>
                </div>
                <Input
                  value={notesById[row.userId] ?? ""}
                  onChange={(e) => setNotesById((m) => ({ ...m, [row.userId]: e.target.value }))}
                  placeholder="Optional note (shown to player on rejection)"
                  className="text-sm"
                  data-testid={`input-identity-note-${row.userId}`}
                />
                <div className="flex gap-2">
                  <Button
                    onClick={() => act(row, "approve")}
                    disabled={decide.isPending}
                    className="flex-1"
                    data-testid={`button-approve-identity-${row.userId}`}
                  >
                    <UserCheck className="w-4 h-4 mr-2" /> Verify
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => act(row, "reject")}
                    disabled={decide.isPending}
                    className="flex-1"
                    data-testid={`button-reject-identity-${row.userId}`}
                  >
                    <UserX className="w-4 h-4 mr-2" /> Reject
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AutomationStatus({ pending }: { pending: boolean }) {
  return (
    <div className="flex items-center gap-3 bg-background/50 border border-border rounded-xl px-4 py-3">
      <div className="relative">
        <Activity className={cn("w-5 h-5", pending ? "text-yellow-400" : "text-green-400")} />
        <span
          className={cn(
            "absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full",
            pending ? "bg-yellow-400 animate-pulse" : "bg-green-400",
          )}
        />
      </div>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">
          Automation
        </p>
        <p className="text-sm font-bold text-white">
          {pending ? "Manual sync running…" : "Healthy · running"}
        </p>
      </div>
    </div>
  );
}

function StatGroup({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 md:p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 rounded-lg bg-background border border-border shrink-0 mt-0.5">
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-white text-base leading-tight">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: "primary" | "yellow" | "red" | "green";
}) {
  const toneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "yellow"
        ? "text-yellow-400"
        : tone === "red"
          ? "text-red-400"
          : tone === "green"
            ? "text-green-400"
            : "text-white";
  return (
    <div className="bg-background/40 border border-border rounded-lg p-3">
      <div className="flex items-center justify-between text-muted-foreground mb-1">
        <span className="text-[10px] uppercase tracking-wider font-bold">{label}</span>
        <span className="opacity-50">{icon}</span>
      </div>
      <p className={cn("text-2xl font-extrabold font-mono", toneClass)}>{value}</p>
    </div>
  );
}

function ActionCard({
  icon,
  title,
  description,
  actionLabel,
  onClick,
  disabled,
  tone,
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  onClick: () => void;
  disabled?: boolean;
  tone: "blue" | "green" | "muted";
  testId: string;
}) {
  const accent =
    tone === "blue"
      ? "border-blue-500/30 bg-blue-500/5"
      : tone === "green"
        ? "border-green-500/30 bg-green-500/5"
        : "border-border bg-card";
  const iconAccent =
    tone === "blue"
      ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
      : tone === "green"
        ? "bg-green-500/15 text-green-400 border-green-500/30"
        : "bg-muted/30 text-muted-foreground border-border";
  const btnClass =
    tone === "blue"
      ? "bg-blue-600 hover:bg-blue-700 text-white"
      : tone === "green"
        ? "bg-green-600 hover:bg-green-700 text-white"
        : "";
  return (
    <div className={cn("rounded-2xl border p-5 flex flex-col", accent)}>
      <div className={cn("p-2 rounded-lg border w-fit mb-3", iconAccent)}>{icon}</div>
      <h3 className="font-bold text-white text-base leading-tight">{title}</h3>
      <p className="text-xs text-muted-foreground mt-1 mb-4 flex-1">{description}</p>
      <Button
        onClick={onClick}
        disabled={disabled}
        variant={tone === "muted" ? "outline" : "default"}
        className={cn("w-full font-semibold", btnClass)}
        data-testid={testId}
      >
        {actionLabel}
      </Button>
    </div>
  );
}
