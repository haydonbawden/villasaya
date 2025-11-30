import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function LeaveManagerScreen() {
  return (
    <AppScreen subtitle="Review and resolve leave requests" title="Leave manager">
      <PlaceholderSection
        action={<AppButton variant="secondary">Approve all</AppButton>}
        description="Check roster conflicts before approving"
        items={[{ status: 'pending', subtitle: '12-14 Feb | Family event', title: 'Kadek' }]}
        title="Pending approvals"
      />
    </AppScreen>
  );
}

export default LeaveManagerScreen;
