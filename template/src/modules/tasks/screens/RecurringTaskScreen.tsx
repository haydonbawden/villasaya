import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function RecurringTaskScreen() {
  return (
    <AppScreen subtitle="Automate repetition with iCal rules" title="Recurring tasks">
      <PlaceholderSection
        action={<AppButton variant="secondary">Save rule</AppButton>}
        description="Configure days, weeks, or custom cadence"
        items={[{ subtitle: 'Every check-out day', title: 'Guest turnover' }]}
        title="Recurrence"
      />
    </AppScreen>
  );
}

export default RecurringTaskScreen;
