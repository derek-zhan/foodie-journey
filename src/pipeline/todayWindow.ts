// isToday() is used by the reviewToday functional test (retiming real
// .test/ photos to simulate "taken today") to check its results land in
// today's window. startOfToday() has no other callers since the merged
// diary screen dropped its today-only scan/filter.
export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isToday(timestamp: number): boolean {
  const start = startOfToday().getTime();
  const end = start + 24 * 60 * 60 * 1000;
  return timestamp >= start && timestamp < end;
}
