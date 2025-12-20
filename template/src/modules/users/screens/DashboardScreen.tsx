import { useEffect, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { AppButton, AppCard, AppScreen, PlaceholderSection } from '@/components/ui';

import { fetchDashboard } from '@/services/api';
import { buildTutorialChecklist, getNextTutorialStep, markTutorialStepCompleted } from '@/modules/users/tutorials';

function DashboardScreen() {
  const [tutorialSteps, setTutorialSteps] = useState(buildTutorialChecklist(['tasks']));
  const { data } = useQuery({ queryFn: fetchDashboard, queryKey: ['dashboard'] });
  const dashboard = data ?? { profile: undefined, tasks: [], villas: [] };
  const overviewItems = useMemo(
    () => [
      { subtitle: `${dashboard.tasks.length} today`, title: 'Tasks due' },
      { subtitle: dashboard.villas[0]?.name ?? 'No villa assigned', title: 'Primary villa' },
      { subtitle: dashboard.profile?.fullName ?? 'Profile pending', title: 'User' },
    ],
    [dashboard.profile?.fullName, dashboard.tasks.length, dashboard.villas],
  );

  useEffect(() => {
    setTutorialSteps((steps) => markTutorialStepCompleted(steps, 'roster'));
  }, []);

  const nextStep = useMemo(() => getNextTutorialStep(tutorialSteps), [tutorialSteps]);

  return (
    <AppScreen subtitle="Operations overview" title="VillaSaya">
      <PlaceholderSection
        action={<AppButton>Start day</AppButton>}
        description="Tasks, roster, and alerts"
        items={overviewItems}
        title="Overview"
      />
      <AppCard
        footer={<AppButton variant="secondary">View onboarding guide</AppButton>}
        subtitle={nextStep ? `${nextStep.title} is next` : 'All onboarding steps completed'}
        title="Tutorials for first-time users"
      >
        {tutorialSteps.map((step) => (
          <PlaceholderSection
            key={step.id}
            description={step.description}
            items={[{ subtitle: step.completed ? 'Completed' : 'Pending', title: step.title }]}
            title={step.completed ? 'Done' : 'Action'}
          />
        ))}
      </AppCard>
    </AppScreen>
  );
}

export default DashboardScreen;
