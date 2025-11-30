import { AppScreen, PlaceholderSection } from '@/components/ui';

function HolidayListScreen() {
  return (
    <AppScreen subtitle="Public and custom holidays for scheduling" title="Holidays">
      <PlaceholderSection
        items={[
          { subtitle: '29 Mar | Full day', title: 'Nyepi' },
          { subtitle: '17 Aug | Full day', title: 'Independence Day' },
        ]}
        title="Upcoming"
      />
    </AppScreen>
  );
}

export default HolidayListScreen;
