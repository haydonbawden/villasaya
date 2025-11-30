import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function StaffListScreen() {
  return (
    <AppScreen subtitle="Manage team members and roles" title="Staff">
      <PlaceholderSection
        action={<AppButton>Add staff</AppButton>}
        description="Invite cleaners, gardeners, security, and contractors."
        items={[
          { subtitle: 'Full-time | Joined Jan 2024', title: 'Kadek - Housekeeper' },
          { subtitle: 'Part-time | Joined Mar 2024', title: 'Wayan - Gardener' },
        ]}
        title="Active staff"
      />
    </AppScreen>
  );
}

export default StaffListScreen;
