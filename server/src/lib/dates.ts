/** Date helpers shared by roster, leave and task recurrence. Dates are `YYYY-MM-DD`. */

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


/** Local wall-clock fields of an instant, in the given zone. */
function zonedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant);
  const field = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  return {
    year: field('year'), month: field('month'), day: field('day'),
    hour: field('hour') % 24, minute: field('minute'), second: field('second'),
  };
}

/** The UTC instant for a local wall-clock time, corrected across DST. */
function fromZonedParts(
  year: number, month: number, day: number,
  hour: number, minute: number, second: number,
  timeZone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  let ms = naive - zoneOffsetMs(new Date(naive), timeZone);
  ms = naive - zoneOffsetMs(new Date(ms), timeZone);
  return new Date(ms);
}

/**
 * When a repeating task should next fall due, in the villa's own calendar.
 *
 * Rules are `daily`, `weekly:1,3,5` (0 is Sunday) or `monthly:15`. The local
 * time of day is preserved: a 07:00 pool check stays a 07:00 pool check rather
 * than drifting with the offset. A monthly day that the next month is too
 * short for lands on that month's last day, so `monthly:31` still happens in
 * February instead of being skipped.
 *
 * Returns null for an unrecognised rule rather than guessing at one.
 */
export function nextOccurrence(rule: string, afterIso: string, timeZone: string): string | null {
  const after = new Date(afterIso);
  if (Number.isNaN(after.getTime())) return null;
  const { year, month, day, hour, minute, second } = zonedParts(after, timeZone);

  const at = (y: number, m: number, d: number) =>
    fromZonedParts(y, m, d, hour, minute, second, timeZone).toISOString();

  if (rule === 'daily') return at(year, month, day + 1);

  const weekly = /^weekly:([0-6](?:,[0-6])*)$/.exec(rule);
  if (weekly?.[1]) {
    const wanted = new Set(weekly[1].split(',').map(Number));
    for (let ahead = 1; ahead <= 7; ahead += 1) {
      const candidate = new Date(Date.UTC(year, month - 1, day + ahead));
      if (wanted.has(candidate.getUTCDay())) {
        return at(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, candidate.getUTCDate());
      }
    }
    return null;
  }

  const monthly = /^monthly:([1-9]|[12][0-9]|3[01])$/.exec(rule);
  if (monthly?.[1]) {
    const wantedDay = Number(monthly[1]);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    // Day 0 of the following month is the last day of this one.
    const daysInMonth = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
    return at(nextYear, nextMonth, Math.min(wantedDay, daysInMonth));
  }

  return null;
}
