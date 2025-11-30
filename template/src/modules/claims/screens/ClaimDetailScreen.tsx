import { AppScreen, PlaceholderSection, StatusBadge } from '@/components/ui';

function ClaimDetailScreen() {
  return (
    <AppScreen subtitle="Status history and attachments" title="Claim detail">
      <PlaceholderSection
        action={<StatusBadge tone="warning">Pending tenant</StatusBadge>}
        description="Audit trail between staff, tenant, and landlord"
        items={[
          { subtitle: 'IDR 250,000', title: 'Amount' },
          { subtitle: 'OCR extracted from photo', title: 'Receipt' },
          { subtitle: 'Submitted → Pending tenant', title: 'History' },
        ]}
        title="Claim"
      />
    </AppScreen>
  );
}

export default ClaimDetailScreen;
