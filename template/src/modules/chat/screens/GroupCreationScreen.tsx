import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function GroupCreationScreen() {
  return (
    <AppScreen subtitle="Role-based chat channels" title="Create group">
      <PlaceholderSection
        action={<AppButton>Create</AppButton>}
        description="Select members, set permissions, and welcome message"
        items={[{ subtitle: 'Operations', title: 'Channel type' }]}
        title="New group"
      />
    </AppScreen>
  );
}

export default GroupCreationScreen;
