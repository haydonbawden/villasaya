import { useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';

import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

import type { Task } from '@/services/api/schemas';
import { fetchTasks } from '@/services/api';
import { buildTaskNotifications } from '@/modules/tasks/taskAlerts';

function TaskListScreen() {
  const { data: tasks = [] } = useQuery<readonly Task[]>({ queryFn: fetchTasks, queryKey: ['tasks'] });
  const notifications = useMemo(() => buildTaskNotifications(tasks), [tasks]);

  return (
    <AppScreen subtitle="Assign, track, and automate workflows" title="Tasks">
      <PlaceholderSection
        action={<AppButton>Create task</AppButton>}
        description="With SLA timers and overdue alerts"
        items={tasks.map((task) => ({
          status: task.status,
          subtitle: task.dueDate ? `Due ${new Date(task.dueDate).toDateString()}` : 'No due date',
          title: task.title,
        }))}
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
