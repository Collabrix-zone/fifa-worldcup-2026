import type { MatchRow, TeamRow, PredictionRow } from "@workspace/db";

export function serializeTeam(team: TeamRow) {
  return {
    id: team.id,
    name: team.name,
    code: team.code,
    flag: team.flag,
    primaryColor: team.primaryColor,
    secondaryColor: team.secondaryColor,
    crestUrl: team.crestUrl,
  };
}

export function effectiveStatus(match: Pick<MatchRow, "status" | "lockTime">): "open" | "locked" | "completed" {
  if (match.status === "completed") return "completed";
  if (match.status === "locked") return "locked";
  if (new Date(match.lockTime).getTime() <= Date.now()) return "locked";
  return "open";
}

export function isLockedNow(match: Pick<MatchRow, "status" | "lockTime">): boolean {
  return effectiveStatus(match) !== "open";
}

export function serializeMatch(match: MatchRow, teamA: TeamRow, teamB: TeamRow) {
  return {
    id: match.id,
    tournamentId: match.tournamentId,
    round: match.round,
    group: match.group,
    teamA: serializeTeam(teamA),
    teamB: serializeTeam(teamB),
    kickoffTime: match.kickoffTime,
    lockTime: match.lockTime,
    status: effectiveStatus(match),
    scoreA: match.scoreA,
    scoreB: match.scoreB,
    extraTimeScoreA: match.extraTimeScoreA,
    extraTimeScoreB: match.extraTimeScoreB,
    penaltiesScoreA: match.penaltiesScoreA,
    penaltiesScoreB: match.penaltiesScoreB,
    duration: match.duration,
  };
}

export function serializePrediction(p: PredictionRow) {
  return {
    id: p.id,
    tournamentId: p.tournamentId,
    matchId: p.matchId,
    userId: p.userId,
    predictedScoreA: p.predictedScoreA,
    predictedScoreB: p.predictedScoreB,
    predictedExtraTimeA: p.predictedExtraTimeA,
    predictedExtraTimeB: p.predictedExtraTimeB,
    predictedPenaltiesA: p.predictedPenaltiesA,
    predictedPenaltiesB: p.predictedPenaltiesB,
    points: p.points,
    resultLabel: p.resultLabel,
    status: p.status,
    submittedAt: p.submittedAt,
  };
}

export function serializeMatchWithPrediction(
  match: MatchRow,
  teamA: TeamRow,
  teamB: TeamRow,
  prediction: PredictionRow | null,
) {
  return {
    ...serializeMatch(match, teamA, teamB),
    isLocked: isLockedNow(match),
    myPrediction: prediction ? serializePrediction(prediction) : null,
  };
}
