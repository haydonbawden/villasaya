import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function IncidentListScreen() {
  return (
    <AppScreen subtitle="Track issues with photos and severity" title="Incidents">
      <PlaceholderSection
        action={<AppButton>New incident</AppButton>}
        description="Convert incidents to follow-up tasks"
        items={[
          { subtitle: 'Medium severity | In review', title: 'Water pump leak' },
          { subtitle: 'Low severity | Open', title: 'Broken lamp' },
        ]}
        title="Reports"
      />
    </AppScreen>
  );
}

export default IncidentListScreen;
