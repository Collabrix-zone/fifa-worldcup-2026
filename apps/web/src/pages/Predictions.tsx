import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import {
  CalendarDays,
  Target,
  CheckCircle2,
  Clock,
  Lock,
  Sparkles,
} from "lucide-react";
import {
  useListMatches,
  getListMatchesQueryKey,
  type MatchWithPrediction,
} from "@workspace/api-client-react";
import { TOURNAMENT_SLUG } from "@/lib/constants";
import { QuickPredictCard } from "@/components/QuickPredictCard";
import { MatchDetailDialog } from "@/components/MatchDetailDialog";
import { cn } from "@/lib/utils";

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDayHeader(d: Date, isToday: boolean, isTomorrow: boolean): string {
  if (isToday) return "Today";
  if (isTomorrow) return "Tomorrow";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export default function Predictions() {
  const { currentUser } = useAuth();
  const [, setLocation] = useLocation();
  // Admins don't play. Bounce to admin panel so they don't end up on a
  // useless predict-only page.
  useEffect(() => {
    if (currentUser?.role === "admin") setLocation("/admin");
  }, [currentUser?.role, setLocation]);

  const matches = useListMatches(TOURNAMENT_SLUG, undefined, {
    query: {
      queryKey: getListMatchesQueryKey(TOURNAMENT_SLUG),
      refetchInterval: 30 * 1000,
    },
  });

  const [openMatch, setOpenMatch] = useState<MatchWithPrediction | null>(null);

  const all = useMemo(
    () =>
      (matches.data ?? [])
        .slice()
        .sort(
          (a, b) =>
            new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime(),
        ),
    [matches.data],
  );

  const today = new Date();
  const todayKey = localDayKey(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = localDayKey(tomorrow);

  // Header stats
  const todaysMatches = all.filter(
    (m) => localDayKey(new Date(m.kickoffTime)) === todayKey,
  );
  const todayLeft = todaysMatches.filter(
    (m) => m.status !== "completed" && !m.isLocked,
  ).length;
  const totalSubmitted = all.filter((m) => m.myPrediction != null).length;
  const totalScheduled = all.length;

  // Group by day
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { date: Date; isToday: boolean; isTomorrow: boolean; matches: MatchWithPrediction[] }
    >();
    for (const m of all) {
      const ko = new Date(m.kickoffTime);
      const key = localDayKey(ko);
      let group = map.get(key);
      if (!group) {
        group = {
          date: ko,
          isToday: key === todayKey,
          isTomorrow: key === tomorrowKey,
          matches: [],
        };
        map.set(key, group);
      }
      group.matches.push(m);
    }
    return Array.from(map.values());
  }, [all, todayKey, tomorrowKey]);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8 pb-24">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card p-6 md:p-8"
      >
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider mb-2">
              <CalendarDays className="w-3.5 h-3.5" />
              Predictions
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
              The full schedule, one ladder.
            </h1>
            <p className="text-muted-foreground mt-2 max-w-xl text-sm">
              Today's matches are open for new picks. Other days are here so you can plan ahead — they unlock as the calendar moves. All predictions auto-lock 15 minutes before kickoff.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 w-full md:w-auto">
            <HeroStat
              label="Today"
              value={todayLeft}
              hint={todayLeft === 1 ? "match open" : "matches open"}
              tone="primary"
            />
            <HeroStat
              label="Submitted"
              value={totalSubmitted}
              hint={`of ${totalScheduled}`}
            />
            <HeroStat
              label="Scheduled"
              value={totalScheduled}
              hint="total fixtures"
            />
          </div>
        </div>
      </motion.section>

      {matches.isLoading ? (
        <p className="text-muted-foreground">Loading matches…</p>
      ) : grouped.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground">
          No matches scheduled yet. We'll fetch them automatically.
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <DayGroup
              key={localDayKey(group.date)}
              date={group.date}
              isToday={group.isToday}
              isTomorrow={group.isTomorrow}
              matches={group.matches}
              onOpen={(m) => setOpenMatch(m)}
              header={fmtDayHeader(group.date, group.isToday, group.isTomorrow)}
            />
          ))}
        </div>
      )}

      <MatchDetailDialog
        match={openMatch}
        open={openMatch != null}
        onOpenChange={(v) => !v && setOpenMatch(null)}
      />
    </div>
  );
}

function HeroStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  tone?: "primary";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3 text-center",
        tone === "primary"
          ? "border-primary/40 bg-primary/10"
          : "border-border bg-background/40",
      )}
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
        {label}
      </p>
      <p
        className={cn(
          "text-2xl font-extrabold font-mono mt-0.5",
          tone === "primary" ? "text-primary" : "text-white",
        )}
      >
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>
    </div>
  );
}

function DayGroup({
  header,
  date,
  isToday,
  isTomorrow,
  matches,
  onOpen,
}: {
  header: string;
  date: Date;
  isToday: boolean;
  isTomorrow: boolean;
  matches: MatchWithPrediction[];
  onOpen: (m: MatchWithPrediction) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3 border-b border-border pb-2">
        <div className="flex items-baseline gap-3">
          <h2
            className={cn(
              "text-lg md:text-xl font-extrabold tracking-tight",
              isToday ? "text-primary" : "text-white",
            )}
          >
            {header}
          </h2>
          <span className="text-xs text-muted-foreground font-medium">
            {date.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isToday && (
            <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/15 text-primary border border-primary/40 px-2 py-1 rounded-full flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Predict now
            </span>
          )}
          {!isToday && !isTomorrow && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground border border-border px-2 py-1 rounded-full">
              Read-only
            </span>
          )}
          <span className="text-xs text-muted-foreground font-mono">
            {matches.length} {matches.length === 1 ? "match" : "matches"}
          </span>
        </div>
      </div>

      {isToday ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {matches.map((m) => (
            <QuickPredictCard
              key={m.id}
              match={m}
              onOpenDetails={() => onOpen(m)}
            />
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
          {matches.map((m) => (
            <ScheduleRow key={m.id} match={m} onClick={() => onOpen(m)} />
          ))}
        </div>
      )}
    </section>
  );
}

function ScheduleRow({
  match,
  onClick,
}: {
  match: MatchWithPrediction;
  onClick: () => void;
}) {
  const ko = new Date(match.kickoffTime);
  const isCompleted = match.status === "completed";
  const isLocked = match.isLocked;
  const myPred = match.myPrediction;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full grid grid-cols-[64px_1fr_auto] items-center gap-3 px-3 md:px-4 py-3 hover:bg-white/[0.03] transition-colors text-left"
      data-testid={`schedule-${match.id}`}
    >
      <div className="text-xs text-muted-foreground font-mono tabular-nums">
        {ko.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-lg shrink-0">{match.teamA.flag}</span>
        <span className="font-bold text-white text-sm truncate">{match.teamA.code}</span>
        {isCompleted ? (
          <span className="font-mono font-extrabold text-white text-sm px-2 whitespace-nowrap">
            {match.scoreA} - {match.scoreB}
          </span>
        ) : (
          <span className="text-muted-foreground font-mono text-xs px-2">vs</span>
        )}
        <span className="font-bold text-white text-sm truncate">{match.teamB.code}</span>
        <span className="text-lg shrink-0">{match.teamB.flag}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {myPred && (
          <span className="hidden md:inline text-[11px] text-muted-foreground">
            you:{" "}
            <span className="font-mono text-white">
              {myPred.predictedScoreA}-{myPred.predictedScoreB}
            </span>
            {myPred.points != null && (
              <span className="ml-1 font-bold text-primary">+{myPred.points}</span>
            )}
          </span>
        )}
        <StatusPill isCompleted={isCompleted} isLocked={isLocked} />
      </div>
    </button>
  );
}

function StatusPill({
  isCompleted,
  isLocked,
}: {
  isCompleted: boolean;
  isLocked: boolean;
}) {
  if (isCompleted) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-green-500/10 text-green-400 border border-green-500/30 px-2 py-1 rounded-full">
        <CheckCircle2 className="w-3 h-3" /> Done
      </span>
    );
  }
  if (isLocked) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-1 rounded-full">
        <Lock className="w-3 h-3" /> Locked
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-muted/30 text-muted-foreground border border-border px-2 py-1 rounded-full">
      <Clock className="w-3 h-3" /> Upcoming
    </span>
  );
}

void Target;
