export function calculatePoints(
  predictedA: number,
  predictedB: number,
  actualA: number,
  actualB: number
): number {
  if (predictedA === actualA && predictedB === actualB) return 7;
  const predResult = Math.sign(predictedA - predictedB);
  const actualResult = Math.sign(actualA - actualB);
  if (predResult === actualResult) {
    const predGoalDiff = predictedA - predictedB;
    const actualGoalDiff = actualA - actualB;
    if (predGoalDiff === actualGoalDiff) return 5;
    return 3;
  }
  if (predictedA === actualA || predictedB === actualB) return 1;
  return 0;
}
