import { motion, AnimatePresence } from "framer-motion";
import { Users, Maximize2, X } from "lucide-react";
import { useGetMatchLineups, type TeamLineup } from "@workspace/api-client-react";
import { FormationPitch } from "./FormationPitch";
import { useState } from "react";

export function LineupPanel({
  matchId,
  teamAFlag,
  teamBFlag,
}: {
  matchId: number;
  teamAFlag: string;
  teamBFlag: string;
}) {
  const { data, isLoading } = useGetMatchLineups(matchId);
  // null = no team expanded (just the two summary cards). 'home'/'away' shows
  // the full pitch view for that side.
  const [pitchFor, setPitchFor] = useState<"home" | "away" | null>(null);

  if (isLoading) {
    return null;
  }
  if (!data) {
    return null;
  }
  // Hide the panel entirely when there are no real lineups to show — better
  // than telling the user "match not linked" or "not announced yet" every
  // time. The recent-form panel below still gives them useful context.
  const hasAny = data.home.lineup.length > 0 || data.away.lineup.length > 0;
  if (!hasAny) {
    return null;
  }

  const expanded = pitchFor === "home" ? data.home : pitchFor === "away" ? data.away : null;
  const expandedFlag = pitchFor === "home" ? teamAFlag : teamBFlag;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-white">
        <Users className="w-3.5 h-3.5 text-primary" />
        Starting lineups
        <span className="text-[10px] text-muted-foreground font-normal">
          Tap a team to see the formation on the pitch
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TeamLineupCard
          team={data.home}
          flag={teamAFlag}
          onExpand={() => setPitchFor("home")}
          testid="lineup-home"
        />
        <TeamLineupCard
          team={data.away}
          flag={teamBFlag}
          onExpand={() => setPitchFor("away")}
          testid="lineup-away"
        />
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="relative"
          >
            <button
              type="button"
              onClick={() => setPitchFor(null)}
              className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 text-[11px] text-white bg-black/50 hover:bg-black/70 px-2 py-1 rounded"
              data-testid="close-pitch"
            >
              <X className="w-3 h-3" /> Close pitch
            </button>
            <FormationPitch
              teamName={expanded.teamName}
              flag={expandedFlag}
              formation={expanded.formation ?? null}
              players={expanded.lineup}
            />
            {expanded.coach && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Coach: <span className="text-white font-medium">{expanded.coach}</span>
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TeamLineupCard({
  team,
  flag,
  onExpand,
  testid,
}: {
  team: TeamLineup;
  flag: string;
  onExpand: () => void;
  testid: string;
}) {
  return (
    <button
      type="button"
      onClick={onExpand}
      className="text-left rounded-xl border border-border bg-background/50 p-3 hover:border-primary/50 hover:bg-background/70 transition-colors group"
      data-testid={testid}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl leading-none">{flag}</span>
          <span className="text-sm font-bold text-white truncate">{team.teamName}</span>
        </div>
        <span className="text-[11px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded shrink-0">
          {team.formation ?? "—"}
        </span>
      </div>
      {team.lineup.length === 0 ? (
        <p className="text-xs text-muted-foreground">Lineup not announced.</p>
      ) : (
        <ol className="space-y-0.5 text-xs">
          {team.lineup.slice(0, 11).map((p, i) => (
            <li key={i} className="flex items-baseline gap-2">
              <span className="text-muted-foreground font-mono w-5 text-right shrink-0">
                {p.shirtNumber ?? "—"}
              </span>
              <span className="text-white truncate">{p.name}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary group-hover:text-primary/80">
        <Maximize2 className="w-3 h-3" /> View on pitch
      </div>
    </button>
  );
}
