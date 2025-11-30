import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function ClaimsListScreen() {
  return (
    <AppScreen subtitle="Expense and reimbursement workflow" title="Claims">
      <PlaceholderSection
        action={<AppButton>Submit claim</AppButton>}
        description="Staff to tenant to landlord chain"
        items={[
          { subtitle: 'IDR 250,000 | Pending tenant', title: 'Laundry detergent' },
          { subtitle: 'IDR 120,000 | Approved', title: 'Bulbs replacement' },
        ]}
        title="Pending approvals"
      />
    </AppScreen>
  );
}

export default ClaimsListScreen;
