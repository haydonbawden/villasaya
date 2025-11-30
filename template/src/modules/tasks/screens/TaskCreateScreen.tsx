import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function TaskCreateScreen() {
  return (
    <AppScreen subtitle="Templates, recurrence, and SLA" title="Create task">
      <PlaceholderSection
        action={<AppButton>Create</AppButton>}
        description="Assign individuals or role groups"
        items={[
          { subtitle: 'Guest check-in workflow', title: 'Template' },
          { subtitle: 'Cleaner group', title: 'Assignments' },
          { subtitle: 'Today 17:00 with SLA alert', title: 'Due' },
        ]}
        title="New task"
      />
    </AppScreen>
  );
}

export default TaskCreateScreen;
