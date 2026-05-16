// Thin client over football-data.org v4. We keep this small on purpose:
// only the endpoints + shapes we actually use for fixture + score sync.

const BASE_URL = "https://api.football-data.org/v4";

export interface FdScoreSide {
  home: number | null;
  away: number | null;
}

export interface FdScore {
  winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
  duration: "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT";
  fullTime: FdScoreSide;
  halfTime: FdScoreSide;
  extraTime?: FdScoreSide | null;
  penalties?: FdScoreSide | null;
  regularTime?: FdScoreSide | null;
}

export interface FdTeam {
  id: number;
  name: string;
  shortName: string | null;
  tla: string | null;
  crest: string | null;
}

export type FdMatchStatus =
  | "SCHEDULED"
  | "TIMED"
  | "IN_PLAY"
  | "PAUSED"
  | "FINISHED"
  | "SUSPENDED"
  | "POSTPONED"
  | "CANCELLED"
  | "AWARDED";

export interface FdMatch {
  id: number;
  utcDate: string;
  status: FdMatchStatus;
  matchday: number | null;
  stage: string;
  group: string | null;
  homeTeam: FdTeam;
  awayTeam: FdTeam;
  score: FdScore;
}

export interface FdMatchesResponse {
  matches: FdMatch[];
}

function token(): string {
  const t = process.env["FOOTBALL_DATA_API_TOKEN"];
  if (!t) {
    throw new Error("FOOTBALL_DATA_API_TOKEN is not set");
  }
  return t;
}

export async function fetchCompetitionMatches(competitionCode = "WC"): Promise<FdMatch[]> {
  const res = await fetch(`${BASE_URL}/competitions/${competitionCode}/matches`, {
    headers: { "X-Auth-Token": token() },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`football-data.org ${competitionCode}/matches HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as FdMatchesResponse;
  return data.matches ?? [];
}

export interface FdCompetition {
  id: number;
  name: string;
  code: string;
}

export interface FdTeamMatch extends FdMatch {
  competition?: FdCompetition;
}

export interface FdLineupPlayer {
  id?: number;
  name: string;
  position?: string | null;
  shirtNumber?: number | null;
}

export interface FdTeamWithLineup extends FdTeam {
  formation?: string | null;
  coach?: { id?: number; name?: string | null } | null;
  lineup?: FdLineupPlayer[];
  bench?: FdLineupPlayer[];
}

export interface FdMatchDetail extends Omit<FdMatch, "homeTeam" | "awayTeam"> {
  homeTeam: FdTeamWithLineup;
  awayTeam: FdTeamWithLineup;
}

export async function fetchMatchDetails(fdMatchId: number): Promise<FdMatchDetail> {
  const res = await fetch(`${BASE_URL}/matches/${fdMatchId}`, {
    headers: { "X-Auth-Token": token() },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `football-data.org matches/${fdMatchId} HTTP ${res.status}: ${body.slice(0, 200)}`,
    );
  }
  return (await res.json()) as FdMatchDetail;
}

export async function fetchTeamMatches(
  teamFdId: number,
  limit = 5,
): Promise<FdTeamMatch[]> {
  const url = `${BASE_URL}/teams/${teamFdId}/matches?status=FINISHED&limit=${limit}`;
  const res = await fetch(url, { headers: { "X-Auth-Token": token() } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `football-data.org teams/${teamFdId}/matches HTTP ${res.status}: ${body.slice(0, 200)}`,
    );
  }
  const data = (await res.json()) as { matches?: FdTeamMatch[] };
  // football-data returns matches oldest-first by default; we want most recent
  // first regardless. Slice locally so we always get the last N played.
  const all = data.matches ?? [];
  return all
    .slice()
    .sort((a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime())
    .slice(0, limit);
}
