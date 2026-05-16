// 15-minute lock invariant: predictions must always lock at least 15 minutes
// before kickoff. Admins can request an earlier lock, but never a later one.
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

export function enforceLockInvariant(
  kickoffTime: Date,
  requestedLockTime?: Date | null,
): Date {
  const cap = new Date(kickoffTime.getTime() - FIFTEEN_MINUTES_MS);
  if (!requestedLockTime || Number.isNaN(requestedLockTime.getTime())) {
    return cap;
  }
  return requestedLockTime.getTime() > cap.getTime() ? cap : requestedLockTime;
}
