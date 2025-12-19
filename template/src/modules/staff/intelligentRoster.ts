import type { StaffRoster, Task } from '@/services/api/schemas';

export type RosterPreference = {
  readonly preferredRole?: string;
  readonly staffId: string;
  readonly maxHoursPerWeek?: number;
};

export type RosterInsight = {
  readonly coverageGaps: readonly string[];
  readonly optimizedAssignments: readonly string[];
  readonly overtimeRisks: readonly string[];
};

function detectCoverageGaps(roster: readonly StaffRoster[], tasks: readonly Task[]): string[] {
  const daysWithMaintenance = new Set(
    tasks.filter((task) => task.priority === 'high').map((task) => new Date(task.dueDate ?? '').getDay()),
  );
  const staffedDays = new Set(roster.map((entry) => new Date(entry.workDate).getDay()));

  return [...daysWithMaintenance]
    .filter((dayIndex) => !staffedDays.has(dayIndex))
    .map((dayIndex) => `No high-priority coverage on ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayIndex]}`);
}

function detectOvertime(roster: readonly StaffRoster[], preferences: readonly RosterPreference[]): string[] {
  const staffHours = roster.reduce<Record<string, number>>((hours, entry) => {
    const start = Number.parseInt(entry.shiftStart.split(':')[0], 10);
    const end = Number.parseInt(entry.shiftEnd.split(':')[0], 10);
    hours[entry.staffId] = (hours[entry.staffId] ?? 0) + (end - start);
    return hours;
  }, {});

  return preferences
    .filter((preference) => preference.maxHoursPerWeek && staffHours[preference.staffId] > preference.maxHoursPerWeek)
    .map((preference) => `Reduce hours for ${preference.staffId} to avoid overtime risk.`);
}

export function generateIntelligentRoster(
  roster: readonly StaffRoster[],
  tasks: readonly Task[],
  preferences: readonly RosterPreference[] = [],
): RosterInsight {
  const coverageGaps = detectCoverageGaps(roster, tasks);
  const overtimeRisks = detectOvertime(roster, preferences);
  const optimizedAssignments = roster.map(
    (entry) =>
      `${entry.workDate} • ${entry.shiftStart}-${entry.shiftEnd} • ${entry.staffId} ${
        preferences.find((pref) => pref.staffId === entry.staffId)?.preferredRole
          ? `→ ${preferences.find((pref) => pref.staffId === entry.staffId)?.preferredRole ?? ''}`
          : ''
      }`,
  );

  return { coverageGaps, optimizedAssignments, overtimeRisks };
}
