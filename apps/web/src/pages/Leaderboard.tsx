import { useAuth } from "@/context/AuthContext";
import { motion } from "framer-motion";
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetLeaderboard, type LeaderboardEntry } from "@workspace/api-client-react";
import { TOURNAMENT_SLUG } from "@/lib/constants";
import { PizzaPrize } from "@/components/PizzaPrize";

export default function Leaderboard() {
  const { currentUser } = useAuth();
  const lb = useGetLeaderboard(TOURNAMENT_SLUG, { filter: "overall" });

  const entries = lb.data ?? [];
  const top3 = entries.slice(0, 3);
  const leader = entries[0];

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8 pb-24">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight mb-2 flex items-center gap-3">
          <Trophy className="w-8 h-8 text-yellow-400" /> Leaderboard
        </h1>
        <p className="text-muted-foreground">The standings update the moment a result is entered.</p>
      </div>

      <PizzaPrize
        variant="banner"
        leaderName={leader?.displayName ?? null}
        leaderPoints={leader?.totalPoints ?? null}
      />

      {lb.isLoading ? (
        <p className="text-muted-foreground">Loading leaderboard…</p>
      ) : entries.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          No entries yet. Be the first to predict!
        </div>
      ) : (
        <>
          {top3.length === 3 && (
            <div className="flex justify-center items-end gap-2 md:gap-4 h-64 mt-12 mb-16">
              <PodiumPlace entry={top3[1]} place={2} height="h-32" color="bg-gray-300" />
              <PodiumPlace entry={top3[0]} place={1} height="h-44" color="bg-yellow-400" isWinner />
              <PodiumPlace entry={top3[2]} place={3} height="h-24" color="bg-orange-400" />
            </div>
          )}

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-background text-muted-foreground text-xs uppercase border-b border-border">
                  <tr>
                    <th className="px-4 py-3">Rank</th>
                    <th className="px-4 py-3">Player</th>
                    <th className="px-4 py-3 text-right">Points</th>
                    <th className="px-4 py-3 text-right hidden sm:table-cell">Exact</th>
                    <th className="px-4 py-3 text-right hidden sm:table-cell">Correct</th>
                    <th className="px-4 py-3 text-right hidden md:table-cell">Last Match</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr
                      key={e.userId}
                      className={cn(
                        "border-b border-border last:border-0 hover:bg-white/5 transition-colors",
                        currentUser?.id === e.userId ? "bg-primary/10 hover:bg-primary/20" : "",
                      )}
                      data-testid={`row-${e.userId}`}
                    >
                      <td className="px-4 py-4 font-bold font-mono text-muted-foreground">{e.rank}</td>
                      <td className="px-4 py-4 font-bold text-white">
                        <div className="flex items-center gap-2 flex-wrap">
                          {e.isMe ? <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span> : null}
                          <span>{e.displayName}</span>
                          {e.rank === 1 && <PizzaPrize variant="tag" />}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right font-bold font-mono text-primary">{e.totalPoints}</td>
                      <td className="px-4 py-4 text-right hidden sm:table-cell text-muted-foreground">{e.exactScores}</td>
                      <td className="px-4 py-4 text-right hidden sm:table-cell text-muted-foreground">{e.correctResults}</td>
                      <td className="px-4 py-4 text-right hidden md:table-cell text-muted-foreground">+{e.lastMatchPoints}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PodiumPlace({
  entry,
  place,
  height,
  color,
  isWinner,
}: {
  entry: LeaderboardEntry;
  place: number;
  height: string;
  color: string;
  isWinner?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: place * 0.1, type: "spring", stiffness: 100 }}
      className="flex flex-col items-center w-24 md:w-32"
    >
      <div className="text-center mb-2">
        <p className="font-bold text-sm md:text-base text-white truncate w-full px-1">{entry.displayName.split(" ")[0]}</p>
        <p className="text-xs font-mono text-primary font-bold">{entry.totalPoints} pts</p>
      </div>
      <div className={cn("w-full rounded-t-lg relative flex justify-center", height, color, isWinner ? "shadow-[0_-10px_30px_rgba(250,204,21,0.3)]" : "")}>
        <div className="absolute top-2 text-background font-black text-2xl md:text-3xl opacity-50">{place}</div>
      </div>
    </motion.div>
  );
}
