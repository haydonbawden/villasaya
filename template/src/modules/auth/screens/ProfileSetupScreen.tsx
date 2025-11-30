import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function ProfileSetupScreen() {
  return (
    <AppScreen subtitle="Collect role-specific metadata" title="Complete your profile">
      <PlaceholderSection
        action={<AppButton variant="secondary">Save profile</AppButton>}
        description="Contact details, employment metadata, and villa preference"
        items={[
          { subtitle: 'Add your legal name', title: 'Full name' },
          { subtitle: 'Phone number and email', title: 'Contact info' },
          { subtitle: 'Position, start date, bank details', title: 'Role metadata' },
        ]}
        title="Profile fields"
      />
    </AppScreen>
  );
}

export default ProfileSetupScreen;
