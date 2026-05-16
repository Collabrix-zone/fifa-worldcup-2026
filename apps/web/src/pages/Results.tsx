import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useListMatches, getListMatchesQueryKey } from "@workspace/api-client-react";
import { TOURNAMENT_SLUG } from "@/lib/constants";

export default function Results() {
  // Auto-refetch every 60s so live scores + ET/penalty updates land
  // without the user reloading. The cron job pushes results upstream
  // every 5 min; client re-poll surfaces them quickly.
  const matches = useListMatches(
    TOURNAMENT_SLUG,
    { status: "completed" },
    {
      query: {
        queryKey: getListMatchesQueryKey(TOURNAMENT_SLUG, { status: "completed" }),
        refetchInterval: 60_000,
      },
    },
  );
  const completed = matches.data ?? [];

  const totalEarned = completed.reduce((sum, m) => sum + (m.myPrediction?.points ?? 0), 0);
  const exactScores = completed.filter((m) => m.myPrediction?.resultLabel === "Exact Score").length;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8 pb-24">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">Results</h1>
        <p className="text-muted-foreground">Recent match results and your points earned.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Total Earned</p>
          <p className="text-2xl font-bold text-primary mt-1">{totalEarned} pts</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Exact Scores</p>
          <p className="text-2xl font-bold text-white mt-1">{exactScores}</p>
        </div>
      </div>

      {matches.isLoading ? (
        <p className="text-muted-foreground">Loading results…</p>
      ) : completed.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          No completed matches yet.
        </div>
      ) : (
        <div className="space-y-4">
          {completed.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-card border border-border rounded-xl p-4 md:p-6 flex flex-col md:flex-row items-center justify-between gap-6"
              data-testid={`result-${m.id}`}
            >
              <div className="flex items-center justify-center gap-6 w-full md:w-auto">
                <div className="flex flex-col items-center gap-1 w-16">
                  <span className="text-3xl">{m.teamA.flag}</span>
                  <span className="font-bold text-sm">{m.teamA.code}</span>
                </div>

                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-3">
                    <div className="bg-background border border-border px-4 py-2 rounded-lg text-2xl font-mono font-bold text-white">
                      {m.scoreA}
                    </div>
                    <div className="text-muted-foreground font-mono font-bold">-</div>
                    <div className="bg-background border border-border px-4 py-2 rounded-lg text-2xl font-mono font-bold text-white">
                      {m.scoreB}
                    </div>
                  </div>
                  {m.duration === "EXTRA_TIME" && (
                    <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">after extra time</span>
                  )}
                  {m.duration === "PENALTY_SHOOTOUT" && m.penaltiesScoreA != null && m.penaltiesScoreB != null && (
                    <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">
                      {m.penaltiesScoreA}-{m.penaltiesScoreB} on penalties
                    </span>
                  )}
                </div>

                <div className="flex flex-col items-center gap-1 w-16">
                  <span className="text-3xl">{m.teamB.flag}</span>
                  <span className="font-bold text-sm">{m.teamB.code}</span>
                </div>
              </div>

              <div className="w-full md:w-auto flex flex-col items-center md:items-end gap-2 border-t border-border pt-4 md:border-0 md:pt-0">
                {m.myPrediction ? (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Your prediction:</span>
                      <span className="font-mono font-bold text-white bg-background px-2 py-1 rounded border border-border">
                        {m.myPrediction.predictedScoreA} - {m.myPrediction.predictedScoreB}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {m.myPrediction.resultLabel && <ResultBadge label={m.myPrediction.resultLabel} />}
                      <span className="text-xl font-bold font-mono text-primary">
                        +{m.myPrediction.points ?? 0} pts
                      </span>
                    </div>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground italic">No prediction submitted</span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function ResultBadge({ label }: { label: string }) {
  const getColors = () => {
    if (label === "Exact Score") return "bg-green-500/20 text-green-400 border-green-500/30";
    if (label === "Goal Difference") return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    if (label === "Correct Result") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    if (label === "One Team Score") return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    return "bg-red-500/20 text-red-400 border-red-500/30";
  };
  return (
    <span className={cn("px-2 py-1 rounded text-xs font-bold border", getColors())}>{label}</span>
  );
}
