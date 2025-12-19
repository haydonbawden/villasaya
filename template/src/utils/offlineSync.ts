import type { Task } from '@/services/api/schemas';

export type SyncTask = {
  readonly description: string;
  readonly endpoint: string;
  readonly id: string;
  readonly payload: Record<string, unknown>;
};

export type OfflineTaskEdit = {
  readonly draft: Partial<Task>;
  readonly editor: string;
  readonly status: 'pending' | 'synced' | 'conflict';
  readonly taskId: string;
  readonly updatedAt: string;
  readonly version: number;
};

const queue: SyncTask[] = [];
const offlineTaskDrafts: Record<string, OfflineTaskEdit> = {};

export function drainQueue() {
  const pending = [...queue];
  queue.length = 0;
  return pending;
}

export function enqueueSync(task: SyncTask) {
  queue.push(task);
}

export function getQueueSnapshot() {
  return [...queue];
}

export function resetOfflineState() {
  queue.length = 0;
  Object.keys(offlineTaskDrafts).forEach((key) => delete offlineTaskDrafts[key]);
}

export function listOfflineTaskDrafts() {
  return Object.values(offlineTaskDrafts);
}

export function summarizeOfflineTasks() {
  return listOfflineTaskDrafts().reduce(
    (summary, draft) => {
      summary[draft.status] += 1;
      return summary;
    },
    { conflict: 0, pending: 0, synced: 0 },
  );
}

export function saveTaskOffline(task: Task, updates: Partial<Task>, editor: string): OfflineTaskEdit {
  const version = (offlineTaskDrafts[task.id]?.version ?? 0) + 1;
  const updatedAt = new Date().toISOString();
  const edit: OfflineTaskEdit = {
    draft: { ...task, ...updates },
    editor,
    status: 'pending',
    taskId: task.id,
    updatedAt,
    version,
  };
  offlineTaskDrafts[task.id] = edit;
  enqueueSync({
    description: `Sync task ${task.title}`,
    endpoint: `/tasks/${task.id}`,
    id: `${task.id}-v${version}`,
    payload: updates,
  });
  return edit;
}

export function syncOfflineTasks(serverTasks: Task[]) {
  const serverMap = new Map(serverTasks.map((task) => [task.id, task]));
  const synced: Task[] = [];
  const conflicts: OfflineTaskEdit[] = [];

  for (const draft of listOfflineTaskDrafts()) {
    const serverTask = serverMap.get(draft.taskId);
    const conflictDetected =
      serverTask?.status === 'completed' &&
      draft.draft.status !== undefined &&
      draft.draft.status !== 'completed';

    if (conflictDetected) {
      offlineTaskDrafts[draft.taskId] = { ...draft, status: 'conflict' };
      conflicts.push(offlineTaskDrafts[draft.taskId]);
      continue;
    }

    const mergedTask: Task = {
      id: draft.taskId,
      priority: draft.draft.priority ?? serverTask?.priority ?? 'medium',
      status: draft.draft.status ?? serverTask?.status ?? 'open',
      title: draft.draft.title ?? serverTask?.title ?? 'Task',
      villaId: draft.draft.villaId ?? serverTask?.villaId ?? 'unknown',
      description: draft.draft.description ?? serverTask?.description,
      dueDate: draft.draft.dueDate ?? serverTask?.dueDate,
      dueTime: draft.draft.dueTime ?? serverTask?.dueTime,
      recurrenceRule: draft.draft.recurrenceRule ?? serverTask?.recurrenceRule,
      requiresCompletionPhoto:
        draft.draft.requiresCompletionPhoto ?? serverTask?.requiresCompletionPhoto ?? false,
    };

    offlineTaskDrafts[draft.taskId] = { ...draft, status: 'synced' };
    synced.push(mergedTask);
  }

  return { conflicts, queue: getQueueSnapshot(), synced };
}

export function simulateBackgroundSync() {
  const pending = drainQueue();
  return pending.map((task) => ({ ...task, syncedAt: new Date().toISOString() }));
}
