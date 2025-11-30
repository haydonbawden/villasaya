import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function AutoSchedulerScreen() {
  return (
    <AppScreen subtitle="Generate monthly roster with conflict detection" title="Auto-scheduler">
      <PlaceholderSection
        action={<AppButton>Run scheduler</AppButton>}
        description="Uses leave, holidays, and templates to build the schedule"
        items={[{ subtitle: 'Ready to generate roster', title: 'Next month' }]}
        title="Automation"
      />
    </AppScreen>
  );
}

export default AutoSchedulerScreen;
