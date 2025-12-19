import type { Task } from '@/services/api/schemas';
import {
  getQueueSnapshot,
  listOfflineTaskDrafts,
  resetOfflineState,
  saveTaskOffline,
  summarizeOfflineTasks,
  syncOfflineTasks,
} from '@/utils/offlineSync';

const baseTask: Task = {
  description: 'Test task',
  dueDate: new Date().toISOString(),
  id: 't1',
  priority: 'medium',
  status: 'open',
  title: 'Clean villa',
  villaId: 'v1',
};

describe('offline task editing and syncing', () => {
  beforeEach(() => {
    resetOfflineState();
  });

  it('stores offline edits and queues payloads', () => {
    saveTaskOffline(baseTask, { status: 'in_progress' }, 'Ayu');

    expect(listOfflineTaskDrafts()).toHaveLength(1);
    expect(getQueueSnapshot()[0]?.endpoint).toBe('/tasks/t1');
  });

  it('marks conflicts when server already completed the task', () => {
    saveTaskOffline(baseTask, { status: 'in_progress' }, 'Ayu');
    const result = syncOfflineTasks([{ ...baseTask, status: 'completed' }]);

    expect(result.conflicts).toHaveLength(1);
    expect(summarizeOfflineTasks().conflict).toBe(1);
  });

  it('merges edits when no conflicts and tracks synced count', () => {
    saveTaskOffline(baseTask, { description: 'Offline update' }, 'Ayu');
    const result = syncOfflineTasks([baseTask]);

    expect(result.synced[0]?.description).toContain('Offline update');
    expect(summarizeOfflineTasks().synced).toBe(1);
  });
});
