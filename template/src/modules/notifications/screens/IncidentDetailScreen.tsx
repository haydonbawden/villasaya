import { AppButton, AppScreen, PlaceholderSection, StatusBadge } from '@/components/ui';

function IncidentDetailScreen() {
  return (
    <AppScreen subtitle="Severity, media, and follow-up" title="Incident detail">
      <PlaceholderSection
        action={<StatusBadge tone="danger">Critical</StatusBadge>}
        description="Attach photos/videos and assign follow-up tasks"
        items={[
          { subtitle: 'Kadek - Staff', title: 'Reported by' },
          { subtitle: 'Converted to task', title: 'Status' },
        ]}
        title="Incident"
      />
      <AppButton variant="secondary">Convert to task</AppButton>
    </AppScreen>
  );
}

export default IncidentDetailScreen;
