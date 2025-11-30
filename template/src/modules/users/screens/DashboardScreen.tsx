import { useEffect } from 'react';

import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

import { fetchDashboard } from '@/services/api';

function DashboardScreen() {
  useEffect(() => {
    void fetchDashboard();
  }, []);

  return (
    <AppScreen subtitle="Operations overview" title="VillaSaya">
      <PlaceholderSection
        action={<AppButton>Start day</AppButton>}
        description="Tasks, roster, and alerts"
        items={[
          { subtitle: '2 today', title: 'Tasks due' },
          { subtitle: 'Kadek on duty', title: 'Upcoming roster' },
          { subtitle: '1 incident in review', title: 'Alerts' },
        ]}
        title="Overview"
      />
    </AppScreen>
  );
}

export default DashboardScreen;
