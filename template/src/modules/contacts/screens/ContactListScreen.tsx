import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function ContactListScreen() {
  return (
    <AppScreen subtitle="Contractors and suppliers shared across users" title="Contacts">
      <PlaceholderSection
        action={<AppButton>Add contact</AppButton>}
        description="Call, message, or assign tasks"
        items={[{ subtitle: '+62 811 2345 678', title: 'BlueWater' }]}
        title="Directory"
      />
    </AppScreen>
  );
}

export default ContactListScreen;
