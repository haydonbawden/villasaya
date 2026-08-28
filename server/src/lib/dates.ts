/** Date helpers shared by roster and leave. All dates are `YYYY-MM-DD`. */

export function today(timezone = 'Asia/Makassar'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function daysBetweenInclusive(start: string, end: string): number {
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  return Math.floor((to - from) / 86_400_000) + 1;
}

/**
 * Leave is counted in calendar days, with a half day allowed at each end. A
 * single-day request flagged as a half day counts 0.5, not 0.
 */
export function countLeaveDays(
  start: string,
  end: string,
  startHalfDay: boolean,
  endHalfDay: boolean,
): number {
  const total = daysBetweenInclusive(start, end);
  if (total <= 0) return 0;
  if (total === 1) return startHalfDay || endHalfDay ? 0.5 : 1;
  let days = total;
  if (startHalfDay) days -= 0.5;
  if (endHalfDay) days -= 0.5;
  return days;
}

export function yearOf(date: string): number {
  return Number.parseInt(date.slice(0, 4), 10);
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function minutesBetween(startIso: string, endIso: string): number {
  return Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000);
}

/**
 * Offset of `timeZone` from UTC, in milliseconds, at the given instant.
 * Derived from Intl rather than a table, so it follows daylight saving.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const field = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  // Intl renders midnight as hour 24 in some locales/zones; 24:00 is the same
  // instant as 00:00, so normalise it before rebuilding the timestamp.
  const hour = field('hour') % 24;
  const asUtc = Date.UTC(field('year'), field('month') - 1, field('day'), hour, field('minute'), field('second'));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The UTC instants bounding a local calendar day, as `[start, end)`.
 *
 * Shift timestamps are stored in UTC, so "which shifts are on today" cannot be
 * answered with SQLite's `date()` — for a villa at UTC+8 that would push every
 * shift starting before 08:00 local onto the previous day. Comparing against
 * these bounds asks the question in the villa's own timezone instead.
 */
export function zonedDayRange(day: string, timeZone: string): { startUtc: string; endUtc: string } {
  const naiveMidnight = Date.parse(`${day}T00:00:00Z`);
  // Two passes: the first offset is read at the wrong instant when the guess
  // lands on the other side of a DST transition, the second corrects it.
  let startMs = naiveMidnight - zoneOffsetMs(new Date(naiveMidnight), timeZone);
  startMs = naiveMidnight - zoneOffsetMs(new Date(startMs), timeZone);

  const naiveNextMidnight = naiveMidnight + 86_400_000;
  let endMs = naiveNextMidnight - zoneOffsetMs(new Date(naiveNextMidnight), timeZone);
  endMs = naiveNextMidnight - zoneOffsetMs(new Date(endMs), timeZone);

  return { startUtc: new Date(startMs).toISOString(), endUtc: new Date(endMs).toISOString() };
}

/** UTC instants spanning an inclusive range of local calendar days. */
export function zonedRangeBounds(from: string, to: string, timeZone: string): { startUtc: string; endUtc: string } {
  return {
    startUtc: zonedDayRange(from, timeZone).startUtc,
    endUtc: zonedDayRange(to, timeZone).endUtc,
  };
}
