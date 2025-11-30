import { AppScreen, PlaceholderSection, StatusBadge } from '@/components/ui';

function AnalyticsDashboardScreen() {
  return (
    <AppScreen subtitle="Insights on tasks, expenses, attendance" title="Villa Health">
      <PlaceholderSection
        action={<StatusBadge tone="success">Healthy</StatusBadge>}
        description="High-level metrics and heatmaps"
        items={[
          { subtitle: '92% on-time', title: 'Task completion' },
          { subtitle: 'IDR 12,000,000', title: 'Expense trend' },
          { subtitle: '87%', title: 'Attendance reliability' },
        ]}
        title="This month"
      />
    </AppScreen>
  );
}

export default AnalyticsDashboardScreen;
