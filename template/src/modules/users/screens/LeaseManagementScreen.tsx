import { useEffect } from 'react';

import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

import { fetchLease } from '@/services/api';

function LeaseManagementScreen() {
  useEffect(() => {
    void fetchLease();
  }, []);

  return (
    <AppScreen subtitle="Upload contracts and edit metadata" title="Lease & property">
      <PlaceholderSection
        action={<AppButton variant="secondary">Upload signed lease</AppButton>}
        description="Start/end dates, rent, due day, and documents"
        items={[
          { subtitle: '01 Jan 2024', title: 'Start' },
          { subtitle: '01 Jan 2026', title: 'End' },
          { subtitle: 'Every 1st of month', title: 'Rent due' },
        ]}
        title="Lease"
      />
    </AppScreen>
  );
}

export default LeaseManagementScreen;
