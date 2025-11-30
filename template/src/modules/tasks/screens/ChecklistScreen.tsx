import { AppScreen, PlaceholderSection } from '@/components/ui';

function ChecklistScreen() {
  return (
    <AppScreen subtitle="Step-by-step completion tracking" title="Checklist">
      <PlaceholderSection
        items={[
          { subtitle: 'Pending', title: 'Restock amenities' },
          { subtitle: 'Waiting for upload', title: 'Photograph room' },
          { subtitle: 'Completed', title: 'Notify tenant' },
        ]}
        title="Items"
      />
    </AppScreen>
  );
}

export default ChecklistScreen;
