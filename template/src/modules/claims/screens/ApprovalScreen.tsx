import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function ApprovalScreen() {
  return (
    <AppScreen subtitle="Tenant and landlord decision flow" title="Claim approval">
      <PlaceholderSection
        action={<AppButton variant="secondary">Approve</AppButton>}
        description="Approve, reject, or forward"
        items={[{ subtitle: 'Laundry detergent - IDR 250,000', title: 'Pending' }]}
        title="Actions"
      />
    </AppScreen>
  );
}

export default ApprovalScreen;
