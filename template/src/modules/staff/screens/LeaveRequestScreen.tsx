import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function LeaveRequestScreen() {
  return (
    <AppScreen subtitle="Submit and track leave" title="Leave request">
      <PlaceholderSection
        action={<AppButton>Submit leave</AppButton>}
        description="Block roster conflicts and notify managers"
        items={[
          { subtitle: 'None', title: 'Upcoming' },
          { subtitle: 'Approved: 2, Pending: 1', title: 'History' },
        ]}
        title="New request"
      />
    </AppScreen>
  );
}

export default LeaveRequestScreen;
