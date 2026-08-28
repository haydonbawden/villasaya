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
