export type SyncTask = {
  readonly description: string;
  readonly endpoint: string;
  readonly id: string;
  readonly payload: Record<string, unknown>;
};

const queue: SyncTask[] = [];

export function drainQueue() {
  const pending = [...queue];
  queue.length = 0;
  return pending;
}

export function enqueueSync(task: SyncTask) {
  queue.push(task);
}

export function simulateBackgroundSync() {
  const pending = drainQueue();
  return pending.map((task) => ({ ...task, syncedAt: new Date().toISOString() }));
}
