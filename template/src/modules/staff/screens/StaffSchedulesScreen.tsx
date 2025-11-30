import { AppScreen, PlaceholderSection } from '@/components/ui';

function StaffSchedulesScreen() {
  return (
    <AppScreen subtitle="Daily and weekly roster view" title="Schedules">
      <PlaceholderSection
        description="Auto-generated from roster rules"
        items={[
          { subtitle: 'Kadek 08:00-16:00 | Wayan 09:00-15:00', title: 'Monday' },
          { subtitle: 'Kadek 08:00-16:00 | Security 24h', title: 'Tuesday' },
        ]}
        title="Upcoming shifts"
      />
    </AppScreen>
  );
}

export default StaffSchedulesScreen;
