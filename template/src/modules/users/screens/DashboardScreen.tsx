import { useEffect, useMemo, useState } from 'react';

import { AppButton, AppCard, AppScreen, PlaceholderSection } from '@/components/ui';

import { fetchDashboard } from '@/services/api';
import { buildTutorialChecklist, getNextTutorialStep, markTutorialStepCompleted } from '@/modules/users/tutorials';

function DashboardScreen() {
  const [tutorialSteps, setTutorialSteps] = useState(buildTutorialChecklist(['tasks']));

  useEffect(() => {
    void fetchDashboard();
    setTutorialSteps((steps) => markTutorialStepCompleted(steps, 'roster'));
  }, []);

  const nextStep = useMemo(() => getNextTutorialStep(tutorialSteps), [tutorialSteps]);

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
