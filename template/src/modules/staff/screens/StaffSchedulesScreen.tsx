import { useMemo } from 'react';

import { AppScreen, PlaceholderSection } from '@/components/ui';

import type { StaffRoster, Task } from '@/services/api/schemas';
import { generateIntelligentRoster } from '@/modules/staff/intelligentRoster';

function StaffSchedulesScreen() {
  const roster: StaffRoster[] = useMemo(
    () => [
      { id: 'r1', shiftEnd: '16:00', shiftStart: '08:00', staffId: 'Kadek', villaId: 'v1', workDate: new Date().toISOString() },
      { id: 'r2', shiftEnd: '22:00', shiftStart: '14:00', staffId: 'Wayan', villaId: 'v1', workDate: new Date().toISOString() },
    ],
    [],
  );

  const criticalTasks: Task[] = useMemo(
    () => [
      {
        dueDate: new Date().toISOString(),
        id: 't-critical',
        priority: 'high',
        status: 'open',
        title: 'Generator maintenance',
        villaId: 'v1',
      },
    ],
    [],
  );

  const rosterInsight = useMemo(
    () =>
      generateIntelligentRoster(roster, criticalTasks, [
        { maxHoursPerWeek: 40, preferredRole: 'Supervisor', staffId: 'Kadek' },
        { maxHoursPerWeek: 32, preferredRole: 'Housekeeping', staffId: 'Wayan' },
      ]),
    [criticalTasks, roster],
  );

  return (
    <AppScreen subtitle="Daily and weekly roster view" title="Schedules">
      <PlaceholderSection
        description="Auto-generated from roster rules"
        items={[
          { subtitle: 'Kadek 08:00-16:00 | Wayan 09:00-15:00', title: 'Monday' },
          { subtitle: 'Kadek 08:00-16:00 | Security 24h', title: 'Tuesday' },
        ]}
        title="Upcoming shifts"
      />
      <PlaceholderSection
        description="AI suggestions to cover maintenance, reduce overtime, and rebalance shifts"
        items={[
          ...rosterInsight.coverageGaps.map((gap) => ({ subtitle: gap, title: 'Coverage gap' })),
          ...rosterInsight.overtimeRisks.map((risk) => ({ subtitle: risk, title: 'Overtime risk' })),
          ...rosterInsight.optimizedAssignments.map((assignment) => ({ subtitle: assignment, title: 'Optimized shift' })),
        ]}
        title="Intelligent rostering"
      />
    </AppScreen>
  );
}

export default StaffSchedulesScreen;
