import { useEffect, useState } from 'react';

import { AppButton, AppScreen, PlaceholderSection, StatusBadge } from '@/components/ui';

import type { Task } from '@/services/api/schemas';
import { getQueueSnapshot, resetOfflineState, saveTaskOffline, summarizeOfflineTasks, syncOfflineTasks } from '@/utils/offlineSync';

function TaskDetailScreen() {
  const [offlineSummary, setOfflineSummary] = useState({ conflict: 0, pending: 0, synced: 0 });
  const [queueSummary, setQueueSummary] = useState<string[]>([]);

  useEffect(() => {
    resetOfflineState();
    const baseTask: Task = {
      description: 'Restock amenities and arrange flowers',
      dueDate: new Date().toISOString(),
      id: 't1',
      priority: 'high',
      requiresCompletionPhoto: true,
      status: 'in_progress',
      title: 'Prepare guest welcome',
      villaId: 'v1',
    };

    saveTaskOffline(baseTask, { description: 'Offline note added while disconnected' }, 'Ayu');
    const completedServerTask: Task = { ...baseTask, id: 't2', status: 'completed', title: 'Guest arrival prep' };
    saveTaskOffline(completedServerTask, { status: 'in_progress' }, 'Ayu');

    const syncResult = syncOfflineTasks([baseTask, completedServerTask]);
    saveTaskOffline({ ...baseTask, id: 't3', status: 'open', title: 'Evening turndown' }, { dueTime: '18:00' }, 'Ayu');

    setOfflineSummary(summarizeOfflineTasks());
    setQueueSummary([
      ...syncResult.synced.map((task) => `${task.title} synced as ${task.status}`),
      ...getQueueSnapshot().map((queued) => `${queued.description} queued for ${queued.endpoint}`),
      ...syncResult.conflicts.map((conflict) => `${conflict.taskId} requires review before syncing`),
    ]);
  }, []);

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
      <PlaceholderSection
        action={<AppButton variant="secondary">Sync offline edits</AppButton>}
        description="Edit tasks without connectivity, then sync with conflict checks"
        items={[
          { subtitle: `${offlineSummary.pending} pending | ${offlineSummary.synced} synced`, title: 'Offline queue' },
          { subtitle: `${offlineSummary.conflict} requiring review`, title: 'Conflicts detected' },
          ...queueSummary.map((item) => ({ subtitle: item, title: 'Sync status' })),
        ]}
        title="Offline-ready editing"
      />
      <AppButton variant="secondary">Complete task</AppButton>
    </AppScreen>
  );
}

export default TaskDetailScreen;
