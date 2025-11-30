import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function MonthlyReportScreen() {
  return (
    <AppScreen subtitle="Drill into historical months" title="Monthly report">
      <PlaceholderSection
        action={<AppButton variant="secondary">Download</AppButton>}
        description="Task completion %, expense totals, attendance heatmap"
        items={[{ subtitle: '3 tasks', title: 'Overdue tasks' }]}
        title="January 2025"
      />
    </AppScreen>
  );
}

export default MonthlyReportScreen;
