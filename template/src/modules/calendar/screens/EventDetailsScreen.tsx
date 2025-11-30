import { AppScreen, PlaceholderSection, StatusBadge } from '@/components/ui';

function EventDetailsScreen() {
  return (
    <AppScreen subtitle="Roster, maintenance, or general events" title="Event details">
      <PlaceholderSection
        action={<StatusBadge tone="info">Draft</StatusBadge>}
        description="Metadata, participants, and reminders"
        items={[
          { subtitle: 'Maintenance', title: 'Type' },
          { subtitle: 'Tomorrow 10:00 - 14:00', title: 'Date' },
          { subtitle: 'Gardener, Contractor', title: 'Attendees' },
        ]}
        title="Event"
      />
    </AppScreen>
  );
}

export default EventDetailsScreen;
