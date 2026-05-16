import { useMemo } from "react";
import type { LineupPlayer } from "@workspace/api-client-react";

type Player = LineupPlayer;

// Crude category lookup: football-data uses fields like "Goalkeeper",
// "Centre-Back", "Right-Back", "Defensive Midfield", "Left Winger", "Centre-Forward".
// We bucket those into GK / DEF / MID / FWD so they can be slotted into rows.
function categorize(position: string | null | undefined): "GK" | "DEF" | "MID" | "FWD" | "OTHER" {
  if (!position) return "OTHER";
  const p = position.toLowerCase();
  if (p.includes("goalkeep") || p === "gk") return "GK";
  if (p.includes("back") || p.includes("defen") || p.includes("centre-back")) return "DEF";
  if (p.includes("midfield") || p.includes("midfielder")) return "MID";
  if (
    p.includes("forward") ||
    p.includes("striker") ||
    p.includes("winger") ||
    p.includes("attack") ||
    p.includes("offence")
  ) {
    return "FWD";
  }
  return "OTHER";
}

interface Slot {
  player: Player;
  // Normalized 0..1 coords on the pitch (x left→right, y back→forward
  // relative to the team's goal at the bottom).
  x: number;
  y: number;
}

function buildSlots(players: Player[], formation: string | null): Slot[] {
  // Parse formation like "4-3-3" or "3-5-2" into row counts (defenders →
  // midfielders → forwards). Falls back to a balanced 4-4-2 if we can't.
  const rows = formation
    ? formation
        .split(/[-/]/)
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0)
    : [];
  const fallback = [4, 4, 2];
  const formRows = rows.length >= 2 && rows.length <= 5 ? rows : fallback;

  // Bucket players by position. Lineup ordering from football-data is GK
  // first, then defenders → midfielders → forwards, but we re-sort to be
  // safe so categorization drives placement.
  const buckets: Record<"GK" | "DEF" | "MID" | "FWD" | "OTHER", Player[]> = {
    GK: [],
    DEF: [],
    MID: [],
    FWD: [],
    OTHER: [],
  };
  for (const p of players) buckets[categorize(p.position)].push(p);

  // Drop the OTHER bucket into the most-undersized row so we still render
  // every starter.
  while (buckets.OTHER.length > 0) {
    const target =
      buckets.MID.length < (formRows[1] ?? 0)
        ? "MID"
        : buckets.FWD.length < (formRows[formRows.length - 1] ?? 0)
          ? "FWD"
          : "DEF";
    buckets[target].push(buckets.OTHER.shift()!);
  }

  // The pitch's "front" (forwards) is at the top in our SVG, goal at bottom.
  // y = 0.05 is the GK line, y = 0.95 is the forward line.
  const slots: Slot[] = [];
  if (buckets.GK[0]) {
    slots.push({ player: buckets.GK[0], x: 0.5, y: 0.08 });
  }

  // Place remaining rows from defense (just above GK) up to forwards.
  // Build a list: [DEF row, MID row(s), FWD row]
  // formRows always: defenders, ...mids, forwards.
  const distribution: { bucket: "DEF" | "MID" | "FWD"; count: number }[] = [];
  if (formRows.length === 2) {
    distribution.push({ bucket: "DEF", count: formRows[0] });
    distribution.push({ bucket: "FWD", count: formRows[1] });
  } else if (formRows.length === 3) {
    distribution.push({ bucket: "DEF", count: formRows[0] });
    distribution.push({ bucket: "MID", count: formRows[1] });
    distribution.push({ bucket: "FWD", count: formRows[2] });
  } else if (formRows.length === 4) {
    distribution.push({ bucket: "DEF", count: formRows[0] });
    distribution.push({ bucket: "MID", count: formRows[1] + formRows[2] });
    distribution.push({ bucket: "FWD", count: formRows[3] });
  } else {
    // 5+ rows, just zig-zag mids
    distribution.push({ bucket: "DEF", count: formRows[0] });
    distribution.push({
      bucket: "MID",
      count: formRows.slice(1, -1).reduce((s, n) => s + n, 0),
    });
    distribution.push({ bucket: "FWD", count: formRows[formRows.length - 1] });
  }

  // Y bands: spread between 0.20 and 0.92 so GK at 0.08 stays separate.
  const yStart = 0.22;
  const yEnd = 0.92;
  distribution.forEach((row, idx) => {
    const y =
      distribution.length === 1
        ? (yStart + yEnd) / 2
        : yStart + ((yEnd - yStart) * idx) / (distribution.length - 1);
    const players = buckets[row.bucket].slice(0, row.count);
    const n = players.length;
    players.forEach((p, i) => {
      // Even spacing across the width, padded inwards from the touchlines.
      const x = n === 1 ? 0.5 : 0.12 + (0.76 * i) / (n - 1);
      slots.push({ player: p, x, y });
    });
    // Drop the placed players from the bucket so leftovers don't repeat.
    buckets[row.bucket] = buckets[row.bucket].slice(n);
  });

  // Any leftovers (e.g. 11th defender if formation under-counts) get parked
  // just below the forward line so they're still visible.
  let leftoverY = 0.5;
  for (const bucket of ["DEF", "MID", "FWD"] as const) {
    for (const p of buckets[bucket]) {
      slots.push({ player: p, x: 0.5, y: leftoverY });
      leftoverY += 0.04;
    }
  }

  return slots;
}

export function FormationPitch({
  teamName,
  flag,
  formation,
  players,
  accentColor = "#22c55e",
}: {
  teamName: string;
  flag: string;
  formation: string | null;
  players: Player[];
  accentColor?: string;
}) {
  const slots = useMemo(() => buildSlots(players, formation), [players, formation]);

  return (
    <div className="rounded-xl border border-border bg-background/60 p-3" data-testid="formation-pitch">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl leading-none">{flag}</span>
          <span className="text-sm font-bold text-white">{teamName}</span>
        </div>
        <span className="text-[11px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">
          {formation ?? "Formation TBD"}
        </span>
      </div>

      <div className="relative w-full" style={{ paddingBottom: "140%" }}>
        <svg
          viewBox="0 0 100 140"
          className="absolute inset-0 w-full h-full rounded-lg"
          preserveAspectRatio="none"
        >
          {/* Pitch background */}
          <defs>
            <pattern id="pitchStripes" width="100" height="14" patternUnits="userSpaceOnUse">
              <rect width="100" height="14" fill="#0a3d1a" />
              <rect y="7" width="100" height="7" fill="#0d4a20" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="100" height="140" fill="url(#pitchStripes)" />

          {/* Outer touchlines + halfway */}
          <g
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="0.4"
            fill="none"
          >
            <rect x="2" y="2" width="96" height="136" />
            <line x1="2" y1="70" x2="98" y2="70" />
            <circle cx="50" cy="70" r="9" />
            <circle cx="50" cy="70" r="0.6" fill="rgba(255,255,255,0.6)" />
            {/* Penalty box (bottom = own goal, top = attacking goal) */}
            <rect x="22" y="2" width="56" height="14" />
            <rect x="38" y="2" width="24" height="6" />
            <rect x="22" y="124" width="56" height="14" />
            <rect x="38" y="132" width="24" height="6" />
          </g>

          {/* Players */}
          {slots.map((s, i) => {
            const cx = s.x * 100;
            const cy = (1 - s.y) * 140; // flip so y=1 (forwards) renders at the top
            return (
              <g key={i}>
                <circle
                  cx={cx}
                  cy={cy}
                  r="4.2"
                  fill={accentColor}
                  stroke="rgba(0,0,0,0.6)"
                  strokeWidth="0.3"
                />
                <text
                  x={cx}
                  y={cy + 1.4}
                  textAnchor="middle"
                  fontSize="3.6"
                  fontWeight="800"
                  fill="white"
                  style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.6)", strokeWidth: 0.3 }}
                >
                  {s.player.shirtNumber ?? ""}
                </text>
                <text
                  x={cx}
                  y={cy + 8.5}
                  textAnchor="middle"
                  fontSize="3"
                  fill="white"
                  style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.7)", strokeWidth: 0.5 }}
                >
                  {shortName(s.player.name)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function shortName(full: string): string {
  // "Lionel Messi" → "L. Messi"; "Kylian Mbappé" → "K. Mbappé".
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}
