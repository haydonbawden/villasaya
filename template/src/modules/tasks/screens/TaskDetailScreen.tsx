import { AppButton, AppScreen, PlaceholderSection, StatusBadge } from '@/components/ui';

function TaskDetailScreen() {
  return (
    <AppScreen subtitle="Checklist, assignees, and SLA" title="Task detail">
      <PlaceholderSection
        action={<StatusBadge tone="warning">SLA 02:15</StatusBadge>}
        description="Shows recurrence, required completion photos, and assignees"
        items={[
          { subtitle: 'Kadek, Wayan', title: 'Assignees' },
          { subtitle: 'Every Monday', title: 'Recurrence' },
          { subtitle: 'Yes', title: 'Requires photo' },
        ]}
        title="Summary"
      />
      <AppButton variant="secondary">Complete task</AppButton>
    </AppScreen>
  );
}

export default TaskDetailScreen;
