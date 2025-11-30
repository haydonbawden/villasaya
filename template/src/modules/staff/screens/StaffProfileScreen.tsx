import { AppButton, AppScreen, PlaceholderSection, StatusBadge } from '@/components/ui';

function StaffProfileScreen() {
  return (
    <AppScreen subtitle="Bank details, contracts, and access" title="Staff profile">
      <PlaceholderSection
        action={<StatusBadge tone="success">Verified</StatusBadge>}
        description="Store identification, emergency contacts, and payment preference"
        items={[
          { subtitle: 'Position, start/end dates, compensation', title: 'Employment details' },
          { subtitle: 'Account name, number, bank', title: 'Bank details' },
          { subtitle: 'Signed PDF stored in document vault', title: 'Contract upload' },
        ]}
        title="Profile overview"
      />
      <AppButton variant="secondary">Edit profile</AppButton>
    </AppScreen>
  );
}

export default StaffProfileScreen;
