export type ResultLabel =
  | "Exact Score"
  | "Goal Difference"
  | "Correct Result"
  | "One Team Score"
  | "Missed";

export interface ScoringResult {
  points: number;
  label: ResultLabel;
}

export interface FullScoringResult extends ScoringResult {
  basePoints: number;
  bonusPoints: number;
  bonusLabels: string[];
}

/**
 * Base regulation scoring (90-min result):
 *  - Exact score: 7 pts (Exact Score)
 *  - Correct result + correct goal difference: 5 pts (Goal Difference)
 *  - Correct result only: 3 pts (Correct Result)
 *  - One team score correct: 1 pt (One Team Score)
 *  - Otherwise: 0 pts (Missed)
 */
export function calculateScore(
  predictedA: number,
  predictedB: number,
  actualA: number,
  actualB: number,
): ScoringResult {
  if (predictedA === actualA && predictedB === actualB) {
    return { points: 7, label: "Exact Score" };
  }

  const predResult = Math.sign(predictedA - predictedB);
  const actualResult = Math.sign(actualA - actualB);

  if (predResult === actualResult) {
    const predDiff = predictedA - predictedB;
    const actualDiff = actualA - actualB;
    if (predDiff === actualDiff) {
      return { points: 5, label: "Goal Difference" };
    }
    return { points: 3, label: "Correct Result" };
  }

  if (predictedA === actualA || predictedB === actualB) {
    return { points: 1, label: "One Team Score" };
  }

  return { points: 0, label: "Missed" };
}

export interface PredictionLike {
  predictedScoreA: number;
  predictedScoreB: number;
  predictedExtraTimeA?: number | null;
  predictedExtraTimeB?: number | null;
  predictedPenaltiesA?: number | null;
  predictedPenaltiesB?: number | null;
}

export interface MatchOutcomeLike {
  scoreA: number | null;
  scoreB: number | null;
  extraTimeScoreA?: number | null;
  extraTimeScoreB?: number | null;
  penaltiesScoreA?: number | null;
  penaltiesScoreB?: number | null;
  duration?: string | null;
}

/**
 * Full prediction scoring = regulation base + knockout bonuses.
 *
 * Bonus rules (only paid out if the user actually entered a prediction for
 * that mode AND the match went there AND the prediction is correct):
 *   - +2 "Extra Time": user predicted ET scores, match went to ET (or beyond),
 *     and ET scores match exactly.
 *   - +3 "Penalties": user predicted pen scores, match went to a shootout,
 *     and the predicted shootout WINNER matches (no exact-tally requirement
 *     because shootout scores are nearly impossible to call exactly).
 *
 * Returns total `points` (= base + bonuses) and the regulation `label` so the
 * existing per-match badge keeps its meaning.
 */
export function calculatePredictionPoints(
  pred: PredictionLike,
  match: MatchOutcomeLike,
): FullScoringResult {
  const base = calculateScore(
    pred.predictedScoreA,
    pred.predictedScoreB,
    match.scoreA ?? 0,
    match.scoreB ?? 0,
  );

  let bonusPoints = 0;
  const bonusLabels: string[] = [];

  const matchHadEt = match.duration === "EXTRA_TIME" || match.duration === "PENALTY_SHOOTOUT";
  const predEtA = pred.predictedExtraTimeA;
  const predEtB = pred.predictedExtraTimeB;
  const matchEtA = match.extraTimeScoreA;
  const matchEtB = match.extraTimeScoreB;
  if (
    matchHadEt &&
    predEtA != null &&
    predEtB != null &&
    matchEtA != null &&
    matchEtB != null &&
    predEtA === matchEtA &&
    predEtB === matchEtB
  ) {
    bonusPoints += 2;
    bonusLabels.push("Extra Time");
  }

  const matchHadPens = match.duration === "PENALTY_SHOOTOUT";
  const predPkA = pred.predictedPenaltiesA;
  const predPkB = pred.predictedPenaltiesB;
  const matchPkA = match.penaltiesScoreA;
  const matchPkB = match.penaltiesScoreB;
  if (
    matchHadPens &&
    predPkA != null &&
    predPkB != null &&
    matchPkA != null &&
    matchPkB != null &&
    Math.sign(predPkA - predPkB) === Math.sign(matchPkA - matchPkB) &&
    predPkA !== predPkB // a "tie" pen prediction is meaningless
  ) {
    bonusPoints += 3;
    bonusLabels.push("Penalties");
  }

  return {
    points: base.points + bonusPoints,
    label: base.label,
    basePoints: base.points,
    bonusPoints,
    bonusLabels,
  };
}
