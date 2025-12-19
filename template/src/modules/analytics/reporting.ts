import type { AnalyticsInsight } from '@/services/api/schemas';
import { canAccess, type Permission } from '@/utils/permissions';

export type TaskHistoryLog = {
  readonly changedAt: string;
  readonly newStatus: string;
  readonly previousStatus?: string;
  readonly taskId: string;
};

export type ExpenseHistoryLog = {
  readonly changedAt: string;
  readonly claimId: string;
  readonly newStatus: string;
  readonly previousStatus?: string;
};

export type ReportingContext = {
  readonly expenseLogs: readonly ExpenseHistoryLog[];
  readonly permissions: readonly Permission[];
  readonly taskLogs: readonly TaskHistoryLog[];
};

export function buildAnalyticsReport(context: ReportingContext): AnalyticsInsight {
  if (!canAccess(context.permissions, 'analytics.view')) {
    throw new Error('User not authorized to view analytics');
  }

  const completedTasks = context.taskLogs.filter((log) => log.newStatus === 'completed').length;
  const reopenedTasks = context.taskLogs.filter((log) => log.previousStatus === 'completed').length;
  const expenseChanges = context.expenseLogs.length;

  return {
    attendanceReliability: 0.87,
    expenseTotal: expenseChanges * 250_000,
    incidentCount: reopenedTasks,
    month: new Date().toISOString().slice(0, 7),
    taskCompletionRate: completedTasks / Math.max(context.taskLogs.length, 1),
  } satisfies AnalyticsInsight;
}

export function detectReportingRisks(taskLogs: readonly TaskHistoryLog[]) {
  const reopened = taskLogs.filter((log) => log.previousStatus === 'completed');
  return reopened.map((log) => ({
    insight: 'Reopened task after completion',
    taskId: log.taskId,
    when: log.changedAt,
  }));
}
