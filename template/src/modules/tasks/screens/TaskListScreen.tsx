import { useMemo } from 'react';

import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

import type { Task } from '@/services/api/schemas';
import { buildTaskNotifications } from '@/modules/tasks/taskAlerts';

function TaskListScreen() {
  const demoTasks: Task[] = useMemo(
    () => [
      {
        dueDate: new Date().toISOString(),
        id: 't1',
        priority: 'high',
        status: 'overdue',
        title: 'Prepare guest welcome',
        villaId: 'v1',
      },
      { id: 't2', priority: 'medium', status: 'open', title: 'Garden trim', villaId: 'v1' },
      {
        dueDate: new Date(Date.now() + 2 * 3_600_000).toISOString(),
        id: 't3',
        priority: 'medium',
        status: 'in_progress',
        title: 'Laundry turnover',
        villaId: 'v1',
      },
    ],
    [],
  );

  const notifications = useMemo(() => buildTaskNotifications(demoTasks), [demoTasks]);

  return (
    <AppScreen subtitle="Assign, track, and automate workflows" title="Tasks">
      <PlaceholderSection
        action={<AppButton>Create task</AppButton>}
        description="With SLA timers and overdue alerts"
        items={[
          { status: 'in_progress', subtitle: 'Due today 17:00', title: 'Prepare guest welcome' },
          { status: 'open', subtitle: 'Due tomorrow', title: 'Garden trim' },
        ]}
        title="Open tasks"
      />
      <PlaceholderSection
        description="Push alerts, inbox, and escalation workflows for late work"
        items={notifications.map((notification) => ({
          subtitle: notification.message,
          title: `${notification.title} • ${notification.severity.toUpperCase()}`,
        }))}
        title="Notifications"
      />
    </AppScreen>
  );
}

export default TaskListScreen;
