import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { TeamFormPanel } from "./TeamFormPanel";
import { LineupPanel } from "./LineupPanel";
import { QuickPredictCard } from "./QuickPredictCard";
import type { MatchWithPrediction } from "@workspace/api-client-react";
import { CheckCircle2, Lock, Clock, Trophy } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function MatchDetailDialog({
  match,
  open,
  onOpenChange,
}: {
  match: MatchWithPrediction | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        data-testid="match-detail-dialog"
      >
        {match && <DialogBody match={match} />}
      </DialogContent>
    </Dialog>
  );
}

function DialogBody({ match }: { match: MatchWithPrediction }) {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const ko = new Date(match.kickoffTime);
  const today = new Date();
  const isToday = isSameLocalDay(ko, today);
  const isCompleted = match.status === "completed";
  const isLocked = match.isLocked && !isCompleted;

  // Mirror the Predictions page rule: only today's open matches accept new
  // submissions. Everything else is read-only.
  const canSubmit = !isCompleted && !isLocked && isToday;
  const lockReason = isCompleted
    ? undefined
    : isLocked
      ? "Locked"
      : !isToday
        ? `Opens ${ko.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`
        : undefined;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-base">
          <span>{match.teamA.flag}</span>
          <span className="font-bold">{match.teamA.name}</span>
          <span className="text-muted-foreground font-normal">vs</span>
          <span className="font-bold">{match.teamB.name}</span>
          <span>{match.teamB.flag}</span>
        </DialogTitle>
        <DialogDescription>
          {match.group ? `Group ${match.group}` : match.round}
          {" · "}
          {ko.toLocaleString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </DialogDescription>
      </DialogHeader>

      {/* State banner — completed score, lock badge, or "predict now". The
          predict-prompt banner is hidden for admins. */}
      {isCompleted ? (
        <CompletedBanner match={match} />
      ) : isAdmin ? null : (
        <StateBanner
          icon={
            isLocked ? (
              <Lock className="w-4 h-4 text-red-400" />
            ) : !isToday ? (
              <Clock className="w-4 h-4 text-muted-foreground" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-primary" />
            )
          }
          title={
            isLocked
              ? "Predictions are locked"
              : !isToday
                ? `Predictions open on match day`
                : "Predictions are open"
          }
          subtitle={
            isLocked
              ? "Kickoff window has passed — your saved prediction is final."
              : !isToday
                ? `You'll be able to lock in your scores on ${ko.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}.`
                : "Lock in your 90-minute score below. Add ET / Penalty bonuses if you fancy."
          }
          tone={isLocked ? "red" : !isToday ? "muted" : "primary"}
        />
      )}

      <LineupPanel
        matchId={match.id}
        teamAFlag={match.teamA.flag}
        teamBFlag={match.teamB.flag}
      />

      <div>
        <p className="text-xs font-semibold text-white uppercase tracking-wider mb-2 mt-2">
          Recent form
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TeamFormPanel
            teamId={match.teamA.id}
            teamName={match.teamA.name}
            flag={match.teamA.flag}
            code={match.teamA.code}
          />
          <TeamFormPanel
            teamId={match.teamB.id}
            teamName={match.teamB.name}
            flag={match.teamB.flag}
            code={match.teamB.code}
          />
        </div>
      </div>

      {/* Show the prediction form for live windows only and for non-admin
          users. Admins don't play, so the predict card is hidden entirely
          (server also blocks /predict for admin sessions). */}
      {!isCompleted && !isAdmin && (
        <div className="pt-2">
          <p className="text-xs font-semibold text-white uppercase tracking-wider mb-2">
            {canSubmit ? "Your prediction" : "Your saved prediction"}
          </p>
          <QuickPredictCard match={match} hideDetailsButton lockReason={lockReason} />
        </div>
      )}
    </>
  );
}

function StateBanner({
  icon,
  title,
  subtitle,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  tone: "primary" | "red" | "muted";
}) {
  const toneClass =
    tone === "primary"
      ? "border-primary/30 bg-primary/5"
      : tone === "red"
        ? "border-red-500/30 bg-red-500/5"
        : "border-border bg-card/50";
  return (
    <div className={`rounded-xl border p-3 flex items-start gap-3 ${toneClass}`}>
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="font-bold text-white text-sm leading-tight">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      </div>
    </div>
  );
}

function CompletedBanner({ match }: { match: MatchWithPrediction }) {
  const myPred = match.myPrediction;
  return (
    <div className="rounded-xl border border-border bg-gradient-to-br from-card to-background p-4 space-y-3">
      <div className="flex items-center justify-center gap-4">
        <div className="flex flex-col items-center gap-1 w-16">
          <span className="text-3xl">{match.teamA.flag}</span>
          <span className="text-xs font-bold text-white">{match.teamA.code}</span>
        </div>
        <div className="text-3xl font-mono font-extrabold text-white">
          {match.scoreA} <span className="text-muted-foreground font-normal">–</span> {match.scoreB}
        </div>
        <div className="flex flex-col items-center gap-1 w-16">
          <span className="text-3xl">{match.teamB.flag}</span>
          <span className="text-xs font-bold text-white">{match.teamB.code}</span>
        </div>
      </div>
      {match.duration === "EXTRA_TIME" && (
        <p className="text-center text-[11px] uppercase tracking-wider text-amber-400 font-bold">
          after extra time
        </p>
      )}
      {match.duration === "PENALTY_SHOOTOUT" &&
        match.penaltiesScoreA != null &&
        match.penaltiesScoreB != null && (
          <p className="text-center text-[11px] uppercase tracking-wider text-amber-400 font-bold">
            {match.penaltiesScoreA}-{match.penaltiesScoreB} on penalties
          </p>
        )}
      <div className="border-t border-border pt-3 flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">Your prediction</div>
        {myPred ? (
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-white bg-background border border-border px-2 py-1 rounded">
              {myPred.predictedScoreA} – {myPred.predictedScoreB}
            </span>
            {myPred.resultLabel && (
              <span className="text-xs px-2 py-1 rounded bg-primary/10 text-primary border border-primary/30 font-semibold">
                {myPred.resultLabel}
              </span>
            )}
            <span className="flex items-center gap-1 font-mono font-bold text-primary text-sm">
              <Trophy className="w-3.5 h-3.5" /> +{myPred.points ?? 0}
            </span>
          </div>
        ) : (
          <span className="text-xs italic text-muted-foreground">Not submitted</span>
        )}
      </div>
    </div>
  );
}
