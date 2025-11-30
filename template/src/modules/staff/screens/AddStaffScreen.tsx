import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function AddStaffScreen() {
  return (
    <AppScreen subtitle="Invite new team members" title="Add staff">
      <PlaceholderSection
        action={<AppButton>Send invite</AppButton>}
        description="Send SMS/email invites, define roles, and assign to roster"
        items={[
          { subtitle: 'Cleaner, gardener, handyman, maid, security', title: 'Role' },
          { subtitle: 'Set default roster days and shifts', title: 'Work days' },
          { subtitle: 'Collect ID and contract', title: 'Document uploads' },
        ]}
        title="Invite options"
      />
    </AppScreen>
  );
}

export default AddStaffScreen;
