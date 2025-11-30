import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function ExportReportsScreen() {
  return (
    <AppScreen subtitle="Generate PDF summaries for landlords" title="Export reports">
      <PlaceholderSection
        action={<AppButton>Export PDF</AppButton>}
        description="Filter by date range, category, and status"
        items={[{ subtitle: 'January 2025', title: 'Monthly summary' }]}
        title="Reports"
      />
    </AppScreen>
  );
}

export default ExportReportsScreen;
