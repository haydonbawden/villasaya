export type TutorialStep = {
  readonly description: string;
  readonly id: string;
  readonly title: string;
  readonly completed?: boolean;
};

const defaultSteps: readonly TutorialStep[] = [
  {
    description: 'Assign your first task and attach a completion photo requirement.',
    id: 'tasks',
    title: 'Tasks & SLAs',
  },
  { description: 'Invite staff and set their roster availability.', id: 'roster', title: 'Create your roster' },
  { description: 'Upload the lease and add emergency contacts.', id: 'compliance', title: 'Compliance' },
  { description: 'Enable offline sync to keep checklists editable without connectivity.', id: 'offline', title: 'Offline mode' },
];

export function buildTutorialChecklist(completedStepIds: readonly string[] = []): TutorialStep[] {
  return defaultSteps.map((step) => ({ ...step, completed: completedStepIds.includes(step.id) }));
}

export function getNextTutorialStep(steps: readonly TutorialStep[]) {
  return steps.find((step) => !step.completed);
}

export function markTutorialStepCompleted(steps: readonly TutorialStep[], stepId: string) {
  return steps.map((step) => (step.id === stepId ? { ...step, completed: true } : step));
}
