import { AppScreen, PlaceholderSection, StatusBadge } from '@/components/ui';

function ContactDetailScreen() {
  return (
    <AppScreen subtitle="Supplier context and history" title="Contact detail">
      <PlaceholderSection
        action={<StatusBadge tone="info">Preferred</StatusBadge>}
        description="Link to tasks and chat rooms"
        items={[
          { subtitle: 'Pool maintenance', title: 'BlueWater' },
          { subtitle: '+62 811 2345 678', title: 'Phone' },
        ]}
        title="Contractor"
      />
    </AppScreen>
  );
}

export default ContactDetailScreen;
