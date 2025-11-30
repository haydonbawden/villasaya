import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function TaskListScreen() {
  return (
    <AppScreen subtitle="Assign, track, and automate workflows" title="Tasks">
      <PlaceholderSection
        action={<AppButton>Create task</AppButton>}
        description="With SLA timers and overdue alerts"
        items={[
          { status: 'in_progress', subtitle: 'Due today 17:00', title: 'Prepare guest welcome' },
          { status: 'open', subtitle: 'Due tomorrow', title: 'Garden trim' },
        ]}
        title="Open tasks"
      />
    </AppScreen>
  );
}

export default TaskListScreen;
