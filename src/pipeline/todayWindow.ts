// Shared by ReviewScreen (filtering the live visit list) and the
// reviewToday functional test (retiming real .test/ photos to simulate
// "taken today") - one definition of "today" so both stay in sync.
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
