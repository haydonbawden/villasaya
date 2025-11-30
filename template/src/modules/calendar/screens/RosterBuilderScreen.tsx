import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function RosterBuilderScreen() {
  return (
    <AppScreen subtitle="Define recurring patterns and rotations" title="Roster builder">
      <PlaceholderSection
        action={<AppButton>Create roster</AppButton>}
        description="Create templates for weekdays, weekends, and events"
        items={[
          { subtitle: '08:00-16:00 | Cleaner + Gardener', title: 'Weekday standard' },
          { subtitle: '06:00-18:00 | Full team', title: 'Turnover day' },
        ]}
        title="Shift templates"
      />
    </AppScreen>
  );
}

export default RosterBuilderScreen;
