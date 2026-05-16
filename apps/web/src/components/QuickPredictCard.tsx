import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Lock, CheckCircle, Sparkles, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useSubmitPrediction,
  type MatchWithPrediction,
  ApiError,
} from "@workspace/api-client-react";

function fmtCountdown(ms: number): { d: number; h: number; m: number; s: number; total: number } {
  const total = Math.max(0, ms);
  const s = Math.floor(total / 1000);
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
    total,
  };
}

export function QuickPredictCard({
  match,
  primary,
  onOpenDetails,
  hideDetailsButton,
  lockReason,
}: {
  match: MatchWithPrediction;
  primary?: boolean;
  onOpenDetails?: () => void;
  hideDetailsButton?: boolean;
  /**
   * When set, treats the card as locked even if the kickoff window hasn't
   * passed yet. Used by the Predictions page to enforce "today only" without
   * touching the server-side lock invariant.
   */
  lockReason?: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const submit = useSubmitPrediction();

  const initial = match.myPrediction;

  const [scoreA, setScoreA] = useState(initial?.predictedScoreA != null ? String(initial.predictedScoreA) : "");
  const [scoreB, setScoreB] = useState(initial?.predictedScoreB != null ? String(initial.predictedScoreB) : "");
  const [etA, setEtA] = useState(initial?.predictedExtraTimeA != null ? String(initial.predictedExtraTimeA) : "");
  const [etB, setEtB] = useState(initial?.predictedExtraTimeB != null ? String(initial.predictedExtraTimeB) : "");
  const [pkA, setPkA] = useState(initial?.predictedPenaltiesA != null ? String(initial.predictedPenaltiesA) : "");
  const [pkB, setPkB] = useState(initial?.predictedPenaltiesB != null ? String(initial.predictedPenaltiesB) : "");

  // ET / Pens are hidden by default and reveal as add-ons. Auto-expand when
  // the user has previously saved a value so they can see and edit it.
  // Empty inputs after expansion are simply treated as "not predicted" — no
  // explicit Remove action needed, the user just collapses or leaves blank.
  const [etOpen, setEtOpen] = useState<boolean>(initial?.predictedExtraTimeA != null);
  const [pkOpen, setPkOpen] = useState<boolean>(initial?.predictedPenaltiesA != null);

  // Live countdown
  const lockMs = useMemo(() => new Date(match.lockTime).getTime(), [match.lockTime]);
  const kickoffMs = useMemo(() => new Date(match.kickoffTime).getTime(), [match.kickoffTime]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const cdLock = fmtCountdown(lockMs - now);
  const cdKick = fmtCountdown(kickoffMs - now);
  const isLocked = match.isLocked || cdLock.total === 0 || Boolean(lockReason);

  const regulationFilled = scoreA !== "" && scoreB !== "";

  const dirty = (() => {
    if (!regulationFilled) return false;
    if (initial == null) return true;
    if (initial.predictedScoreA !== Number(scoreA) || initial.predictedScoreB !== Number(scoreB)) return true;
    const cmpOptional = (current: string, prev: number | null | undefined) => {
      const cur = current === "" ? null : Number(current);
      const p = prev ?? null;
      return cur !== p;
    };
    if (cmpOptional(etA, initial.predictedExtraTimeA) || cmpOptional(etB, initial.predictedExtraTimeB)) return true;
    if (cmpOptional(pkA, initial.predictedPenaltiesA) || cmpOptional(pkB, initial.predictedPenaltiesB)) return true;
    return false;
  })();

  const handleSave = async () => {
    if (!regulationFilled) {
      toast({ title: "Enter the 90-minute score first", variant: "destructive" });
      return;
    }
    const optional = (a: string, b: string): { a: number; b: number } | null => {
      if (a === "" || b === "") return null;
      return { a: Number(a), b: Number(b) };
    };
    const et = optional(etA, etB);
    const pk = optional(pkA, pkB);
    try {
      await submit.mutateAsync({
        id: match.id,
        data: {
          predictedScoreA: Number(scoreA),
          predictedScoreB: Number(scoreB),
          predictedExtraTimeA: et?.a ?? null,
          predictedExtraTimeB: et?.b ?? null,
          predictedPenaltiesA: pk?.a ?? null,
          predictedPenaltiesB: pk?.b ?? null,
        },
      });
      toast({ title: "Locked in. Good luck." });
      await queryClient.invalidateQueries();
    } catch (err) {
      const message =
        err instanceof ApiError && err.data && typeof err.data === "object" && "error" in err.data
          ? String((err.data as { error: unknown }).error)
          : "Could not save your prediction.";
      toast({ title: "Save failed", description: message, variant: "destructive" });
    }
  };

  const teamsArea = (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex flex-col items-center gap-1 flex-1">
        <span className="text-3xl">{match.teamA.flag}</span>
        <span className="font-bold text-sm text-white">{match.teamA.code}</span>
      </div>
      <div className="text-muted-foreground font-mono text-xs">VS</div>
      <div className="flex flex-col items-center gap-1 flex-1">
        <span className="text-3xl">{match.teamB.flag}</span>
        <span className="font-bold text-sm text-white">{match.teamB.code}</span>
      </div>
    </div>
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border p-5 ${primary ? "bg-gradient-to-br from-primary/10 to-card border-primary/30" : "bg-card border-border"}`}
      data-testid={`quick-predict-${match.id}`}
    >
      <div className="flex items-center justify-between mb-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        <span>{match.group ? `Group ${match.group}` : match.round}</span>
        {isLocked ? (
          <span className="flex items-center gap-1 text-red-400 bg-red-400/10 px-2 py-1 rounded">
            <Lock className="w-3 h-3" /> {lockReason ?? "Locked"}
          </span>
        ) : initial ? (
          <span className="flex items-center gap-1 text-green-400 bg-green-400/10 px-2 py-1 rounded">
            <CheckCircle className="w-3 h-3" /> Submitted
          </span>
        ) : (
          <span className="flex items-center gap-1 text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded">
            <Clock className="w-3 h-3" /> Open
          </span>
        )}
      </div>

      {primary && !isLocked && (
        <div className="flex items-center justify-between mb-5 -mt-1">
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Locks in</p>
            <p className="text-2xl font-extrabold font-mono text-white">
              {cdLock.d > 0 ? `${cdLock.d}d ` : ""}
              {String(cdLock.h).padStart(2, "0")}:{String(cdLock.m).padStart(2, "0")}:{String(cdLock.s).padStart(2, "0")}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Kickoff</p>
            <p className="text-sm font-medium text-white">
              {new Date(match.kickoffTime).toLocaleString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <p className="text-xs text-muted-foreground">
              in {cdKick.d > 0 ? `${cdKick.d}d ` : ""}
              {cdKick.h}h {cdKick.m}m
            </p>
          </div>
        </div>
      )}

      {!hideDetailsButton && onOpenDetails ? (
        <button
          type="button"
          onClick={onOpenDetails}
          className="block w-full text-left rounded-xl p-2 -m-2 hover:bg-white/5 transition-colors group cursor-pointer"
          data-testid={`open-details-${match.id}`}
          aria-label="Open match details, lineups and team form"
        >
          {teamsArea}
          <p className="text-[11px] text-center text-primary/70 group-hover:text-primary -mt-2 mb-3 font-medium">
            Tap teams for lineups, formation &amp; form →
          </p>
        </button>
      ) : (
        teamsArea
      )}

      {/* Required: 90-minute score */}
      <div className="rounded-xl border border-border bg-background/40 p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold text-white uppercase tracking-wider">
            Final score · 90 min
          </p>
          <span className="text-[10px] font-medium text-yellow-300/90 bg-yellow-300/10 px-1.5 py-0.5 rounded">
            Required
          </span>
        </div>
        <ScoreInputRow
          a={scoreA}
          b={scoreB}
          onA={setScoreA}
          onB={setScoreB}
          disabled={isLocked}
          testidPrefix={`reg-${match.id}`}
        />
        <p className="text-[11px] text-muted-foreground text-center mt-2">
          Base scoring: 7 exact · 5 goal diff · 3 result · 1 one team · 0 miss
        </p>
      </div>

      {/* Optional add-ons. Disabled until the regulation score is filled in. */}
      <AddonSection
        title="Extra time bonus"
        bonus="+2"
        helper="Cumulative score at end of extra time. +2 if the match goes to ET and your ET score is exact. Leave blank if you don't want to predict."
        open={etOpen}
        onToggle={() => setEtOpen((v) => !v)}
        a={etA}
        b={etB}
        onA={setEtA}
        onB={setEtB}
        disabled={isLocked || !regulationFilled}
        disabledReason={!regulationFilled ? "Enter the 90-minute score first" : undefined}
        testidPrefix={`et-${match.id}`}
      />

      <AddonSection
        title="Penalty shootout bonus"
        bonus="+3"
        helper="Final shootout score. +3 if the match goes to a shootout and you pick the right winner. Leave blank if you don't want to predict."
        open={pkOpen}
        onToggle={() => setPkOpen((v) => !v)}
        a={pkA}
        b={pkB}
        onA={setPkA}
        onB={setPkB}
        disabled={isLocked || !regulationFilled}
        disabledReason={!regulationFilled ? "Enter the 90-minute score first" : undefined}
        testidPrefix={`pk-${match.id}`}
      />

      <Button
        onClick={handleSave}
        disabled={isLocked || !dirty || submit.isPending}
        className="w-full mt-4 font-bold"
        data-testid={`save-quick-${match.id}`}
      >
        <Sparkles className="w-4 h-4 mr-1" />
        {submit.isPending ? "Saving…" : initial ? "Update prediction" : "Lock in prediction"}
      </Button>
    </motion.div>
  );
}

function AddonSection({
  title,
  bonus,
  helper,
  open,
  onToggle,
  a,
  b,
  onA,
  onB,
  disabled,
  disabledReason,
  testidPrefix,
}: {
  title: string;
  bonus: string;
  helper: string;
  open: boolean;
  onToggle: () => void;
  a: string;
  b: string;
  onA: (v: string) => void;
  onB: (v: string) => void;
  disabled: boolean;
  disabledReason?: string;
  testidPrefix: string;
}) {
  const filled = a !== "" && b !== "";
  return (
    <div className="mt-2 rounded-xl border border-border bg-background/40 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled && !open}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid={`${testidPrefix}-toggle`}
        title={disabled && disabledReason ? disabledReason : undefined}
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-white">
          {open ? (
            <ChevronUp className="w-3.5 h-3.5 text-primary" />
          ) : (
            <Plus className="w-3.5 h-3.5 text-primary" />
          )}
          {title}
          <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
            {bonus}
          </span>
          {filled && !open && (
            <span className="text-[10px] text-green-400 font-mono">{a}–{b}</span>
          )}
        </span>
        {open && (
          <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
            <ChevronDown className="w-3 h-3 rotate-180" /> Tap to hide
          </span>
        )}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1">
              <ScoreInputRow
                a={a}
                b={b}
                onA={onA}
                onB={onB}
                disabled={disabled}
                testidPrefix={testidPrefix}
                size="sm"
              />
              <p className="text-[11px] text-muted-foreground text-center mt-2">{helper}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ScoreInputRow({
  a,
  b,
  onA,
  onB,
  disabled,
  testidPrefix,
  hint,
  size = "lg",
}: {
  a: string;
  b: string;
  onA: (v: string) => void;
  onB: (v: string) => void;
  disabled: boolean;
  testidPrefix: string;
  hint?: string;
  size?: "lg" | "sm";
}) {
  const dim = size === "lg" ? "w-16 h-14 text-2xl" : "w-12 h-11 text-xl";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-center gap-3">
        <Input
          type="number"
          value={a}
          onChange={(e) => onA(e.target.value)}
          disabled={disabled}
          className={`${dim} text-center font-bold font-mono bg-background`}
          placeholder="-"
          min={0}
          max={20}
          data-testid={`${testidPrefix}-a`}
        />
        <span className="text-muted-foreground font-mono">–</span>
        <Input
          type="number"
          value={b}
          onChange={(e) => onB(e.target.value)}
          disabled={disabled}
          className={`${dim} text-center font-bold font-mono bg-background`}
          placeholder="-"
          min={0}
          max={20}
          data-testid={`${testidPrefix}-b`}
        />
      </div>
      {hint && <p className="text-[11px] text-muted-foreground text-center">{hint}</p>}
    </div>
  );
}
