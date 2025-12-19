import type { Task } from '@/services/api/schemas';

export type TaskNotification = {
  readonly message: string;
  readonly severity: 'warning' | 'critical' | 'info';
  readonly taskId: string;
  readonly title: string;
};

function isOverdue(task: Task, now: Date) {
  if (task.status === 'overdue') {
    return true;
  }
  if (!task.dueDate) {
    return false;
  }
  return new Date(task.dueDate).getTime() < now.getTime();
}

export function buildTaskNotifications(tasks: readonly Task[], now = new Date()): TaskNotification[] {
  return tasks
    .map((task) => {
      if (isOverdue(task, now)) {
        return {
          message: `${task.title} is overdue. Notify assigned staff and escalate to manager if not updated within 2 hours.`,
          severity: 'critical',
          taskId: task.id,
          title: 'Overdue task',
        } satisfies TaskNotification;
      }

      if (task.dueDate) {
        const hoursUntilDue = (new Date(task.dueDate).getTime() - now.getTime()) / 3_600_000;
        if (hoursUntilDue < 6 && task.status !== 'completed') {
          return {
            message: `${task.title} is due soon. Send reminder and check staffing coverage.`,
            severity: 'warning',
            taskId: task.id,
            title: 'Due soon',
          } satisfies TaskNotification;
        }
      }

      return {
        message: `${task.title} is on track. Keep progress updated for analytics reporting.`,
        severity: 'info',
        taskId: task.id,
        title: 'Healthy task',
      } satisfies TaskNotification;
    })
    .sort((a, b) => {
      const priority = { critical: 0, warning: 1, info: 2 } as const;
      return priority[a.severity] - priority[b.severity];
    });
}
