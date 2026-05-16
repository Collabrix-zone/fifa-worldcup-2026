import { useGetTeamForm } from "@workspace/api-client-react";

export function TeamFormPanel({
  teamId,
  teamName,
  flag,
  code,
}: {
  teamId: number;
  teamName: string;
  flag: string;
  code: string;
}) {
  const { data, isLoading } = useGetTeamForm(teamId);

  return (
    <div
      className="rounded-xl border border-border bg-background/50 p-4 space-y-3"
      data-testid={`team-form-${teamId}`}
    >
      <div className="flex items-center gap-3">
        <span className="text-3xl leading-none">{flag}</span>
        <div className="min-w-0">
          <p className="font-bold text-white truncate">{teamName}</p>
          <p className="text-xs text-muted-foreground">Last 5 results</p>
        </div>
        <div className="ml-auto text-xs text-muted-foreground font-mono">{code}</div>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading recent matches…</p>
      ) : !data || data.recent.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {data?.unavailableReason ?? "No recent matches available."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {data.recent.map((m, idx) => (
            <li
              key={idx}
              className="flex items-center gap-2 text-xs"
              data-testid={`form-entry-${teamId}-${idx}`}
            >
              <ResultBadge result={m.result} />
              <span className="text-muted-foreground w-14 shrink-0">
                {new Date(m.utcDate).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <span className="text-white truncate flex-1">
                {m.isHome ? "vs" : "@"} {m.opponentName}
              </span>
              <span className="font-mono text-white">
                {m.scoreFor ?? "?"}–{m.scoreAgainst ?? "?"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ResultBadge({ result }: { result: "W" | "D" | "L" | null }) {
  const cls =
    result === "W"
      ? "bg-green-500/20 text-green-300"
      : result === "L"
        ? "bg-red-500/20 text-red-300"
        : result === "D"
          ? "bg-yellow-500/20 text-yellow-300"
          : "bg-muted text-muted-foreground";
  return (
    <span
      className={`w-5 h-5 inline-flex items-center justify-center rounded text-[10px] font-bold ${cls}`}
    >
      {result ?? "—"}
    </span>
  );
}
