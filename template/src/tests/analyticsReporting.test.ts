import { buildAnalyticsReport, detectReportingRisks, type ExpenseHistoryLog, type TaskHistoryLog } from '@/modules/analytics/reporting';
import { rolePermissions } from '@/providers/RoleProvider';
import type { Permission } from '@/utils/permissions';

describe('analytics reporting workflows', () => {
  const taskLogs: TaskHistoryLog[] = [
    { changedAt: '2024-01-01', newStatus: 'completed', taskId: 't1' },
    { changedAt: '2024-01-02', newStatus: 'completed', previousStatus: 'completed', taskId: 't2' },
  ];
  const expenseLogs: ExpenseHistoryLog[] = [
    { changedAt: '2024-01-03', claimId: 'c1', newStatus: 'approved' },
  ];

  it('builds analytics when permission exists', () => {
    const analytics = buildAnalyticsReport({
      expenseLogs,
      permissions: rolePermissions.tenant as Permission[],
      taskLogs,
    });

    expect(analytics.taskCompletionRate).toBeCloseTo(1);
    expect(analytics.expenseTotal).toBe(250_000);
  });

  it('rejects analytics when permission is missing', () => {
    expect(() =>
      buildAnalyticsReport({ expenseLogs, permissions: rolePermissions.staff as Permission[], taskLogs }),
    ).toThrow('User not authorized');
  });

  it('flags reopened tasks in reporting risks', () => {
    const risks = detectReportingRisks(taskLogs);
    expect(risks.find((risk) => risk.taskId === 't2')).toBeDefined();
  });
});
