/** Currency, date and duration formatting shared across screens. */

const ZERO_DECIMAL = new Set(['IDR', 'JPY', 'KRW', 'VND']);

/** Amounts are stored as integer minor units; IDR has no subunit in practice. */
export function formatMoney(amountMinor: number, currency: string): string {
  const zeroDecimal = ZERO_DECIMAL.has(currency);
  const value = zeroDecimal ? amountMinor : amountMinor / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: zeroDecimal ? 0 : 2,
    maximumFractionDigits: zeroDecimal ? 0 : 2,
  }).format(value);
}

export function toMinorUnits(input: string, currency: string): number {
  const numeric = Number.parseFloat(input.replace(/[^0-9.]/g, ''));
  if (Number.isNaN(numeric)) return 0;
  return ZERO_DECIMAL.has(currency) ? Math.round(numeric) : Math.round(numeric * 100);
}

export function fromMinorUnits(amountMinor: number, currency: string): string {
  return ZERO_DECIMAL.has(currency) ? String(amountMinor) : (amountMinor / 100).toFixed(2);
}

export function formatDate(value: string | null, timezone?: string): string {
  if (!value) return '—';
  const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(value.length === 10 ? {} : { timeZone: timezone }),
  }).format(date);
}

export function formatTime(value: string, timezone?: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(new Date(value));
}

export function formatDateTime(value: string | null, timezone?: string): string {
  if (!value) return '—';
  return `${formatDate(value, timezone)}, ${formatTime(value, timezone)}`;
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

/** "3 days ago", "in 2 hours" — used for timestamps and due dates. */
export function relativeTime(value: string | null): string {
  if (!value) return '';
  const diffMs = new Date(value).getTime() - Date.now();
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['week', 604_800_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) return formatter.format(Math.round(diffMs / ms), unit);
  }
  return 'just now';
}

export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
}

/** Splits an ISO datetime into the value pairs a datetime-local input wants. */
export function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
