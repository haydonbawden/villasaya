import { AppScreen, PlaceholderSection } from '@/components/ui';

function CalendarViewScreen() {
  return (
    <AppScreen subtitle="Monthly, weekly, and daily views" title="Calendar">
      <PlaceholderSection
        description="Roster, maintenance, and holidays color-coded by role"
        items={[
          { subtitle: 'Maintenance | 10:00 - 14:00', title: 'Deep clean' },
          { subtitle: 'Full day | Public holiday', title: 'Galungan holiday' },
        ]}
        title="Upcoming events"
      />
    </AppScreen>
  );
}

export default CalendarViewScreen;
