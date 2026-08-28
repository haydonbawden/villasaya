import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../lib/api.ts';
import { useVilla } from '../context/VillaContext.tsx';
import { formatDate, relativeTime } from '../lib/format.ts';
import { PageHeader } from '../components/PageHeader.tsx';
import { Avatar, Button, EmptyState, ErrorNote, Field, Modal, Spinner, StatusPill } from '../components/ui.tsx';
import type { Member, Task } from '../lib/types.ts';

const COLUMNS: Array<{ status: Task['status']; label: string }> = [
  { status: 'todo', label: 'To do' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'blocked', label: 'Blocked' },
  { status: 'done', label: 'Done' },
];

export function TasksPage() {
  const { villa, can, membershipId, scope } = useVilla();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [mine, setMine] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: ['tasks', villa.id],
    queryFn: () => api<{ tasks: Task[] }>(`/villas/${villa.id}/tasks`),
  });

  const tasks = useMemo(() => {
    const all = data?.tasks ?? [];
    return mine ? all.filter((task) => task.assignees.some((a) => a.membershipId === membershipId)) : all;
  }, [data, mine, membershipId]);

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Task['status'] }) =>
      api(`/villas/${villa.id}/tasks/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks', villa.id] }),
  });

  if (isPending) return <Spinner label="Loading tasks" />;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Tasks"
        description={
          scope('tasks') === 'own'
            ? 'The work assigned to you.'
            : 'Everything that needs doing around the villa.'
        }
        actions={
          <>
            {scope('tasks') === 'all' && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="rounded border-sand-300 text-brand-600 focus:ring-brand-500"
                  checked={mine}
                  onChange={(event) => setMine(event.target.checked)}
                />
                Only mine
              </label>
            )}
            {can('tasks:create') && <Button onClick={() => setCreating(true)}>New task</Button>}
          </>
        }
      />

      {tasks.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          description={
            can('tasks:create')
              ? 'Create the first task and assign it to someone on the team.'
              : 'Nothing has been assigned to you.'
          }
          action={can('tasks:create') ? <Button onClick={() => setCreating(true)}>New task</Button> : undefined}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-4">
          {COLUMNS.map((column) => {
            const columnTasks = tasks.filter((task) => task.status === column.status);
            return (
              <section key={column.status} className="min-w-0">
                <div className="mb-2 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold text-slate-700">{column.label}</h2>
                  <span className="text-xs text-slate-400">{columnTasks.length}</span>
                </div>
                <ul className="space-y-2">
                  {columnTasks.map((task) => (
                    <li key={task.id}>
                      <TaskCard
                        task={task}
                        timezone={villa.timezone}
                        onOpen={() => setOpenTask(task.id)}
                        onAdvance={
                          canMove(task, membershipId, can)
                            ? (status) => updateStatus.mutate({ id: task.id, status })
                            : undefined
                        }
                      />
                    </li>
                  ))}
                  {columnTasks.length === 0 && (
                    <li className="rounded-lg border border-dashed border-sand-300 px-3 py-6 text-center text-xs text-slate-400">
                      Nothing here
                    </li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {creating && <TaskFormModal onClose={() => setCreating(false)} />}
      {openTask && <TaskDetailModal taskId={openTask} onClose={() => setOpenTask(null)} />}
    </div>
  );
}

function canMove(task: Task, membershipId: string, can: (...keys: string[]) => boolean): boolean {
  if (can('tasks:update.all')) return true;
  return can('tasks:update.own') && task.assignees.some((a) => a.membershipId === membershipId);
}

function TaskCard({
  task,
  timezone,
  onOpen,
  onAdvance,
}: {
  task: Task;
  timezone: string;
  onOpen: () => void;
  onAdvance?: (status: Task['status']) => void;
}) {
  const overdue = task.dueAt && new Date(task.dueAt) < new Date() && task.status !== 'done';
  return (
    <article className="card p-3 transition hover:border-brand-300">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-medium leading-snug text-slate-900">{task.title}</h3>
          {task.priority !== 'normal' && <StatusPill status={task.priority} />}
        </div>
        {task.category?.name && (
          <span
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-500"
            style={{ color: task.category.colour ?? undefined }}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: task.category.colour ?? '#94a3b8' }}
              aria-hidden="true"
            />
            {task.category.name}
          </span>
        )}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex -space-x-1.5">
            {task.assignees.slice(0, 3).map((assignee) => (
              <Avatar key={assignee.membershipId} name={assignee.fullName} colour={assignee.avatarColour} size="sm" />
            ))}
            {task.assignees.length === 0 && <span className="text-xs text-slate-400">Unassigned</span>}
          </div>
          {task.dueAt && (
            <span className={`text-xs ${overdue ? 'font-medium text-red-700' : 'text-slate-500'}`}>
              {overdue ? 'Overdue' : formatDate(task.dueAt, timezone)}
            </span>
          )}
        </div>
      </button>

      {onAdvance && task.status !== 'done' && (
        <div className="mt-3 flex gap-1.5 border-t border-sand-100 pt-2.5">
          {task.status !== 'in_progress' && (
            <button
              type="button"
              className="rounded px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
              onClick={() => onAdvance('in_progress')}
            >
              Start
            </button>
          )}
          <button
            type="button"
            className="rounded px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
            onClick={() => onAdvance('done')}
          >
            Mark done
          </button>
          {task.status !== 'blocked' && (
            <button
              type="button"
              className="rounded px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
              onClick={() => onAdvance('blocked')}
            >
              Blocked
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function TaskFormModal({ onClose }: { onClose: () => void }) {
  const { villa, can, membershipId } = useVilla();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'normal' as Task['priority'],
    dueAt: '',
    categoryId: '',
    location: '',
  });
  const [assignees, setAssignees] = useState<string[]>([]);
  const [checklist, setChecklist] = useState('');

  const { data: members } = useQuery({
    queryKey: ['members', villa.id],
    queryFn: () => api<{ members: Member[] }>(`/villas/${villa.id}/members`),
    enabled: can('members:view'),
  });
  const { data: categories } = useQuery({
    queryKey: ['taskCategories', villa.id],
    queryFn: () => api<{ categories: Array<{ id: string; name: string; colour: string }> }>(
      `/villas/${villa.id}/tasks/categories`,
    ),
  });

  const mutation = useMutation({
    mutationFn: () =>
      api(`/villas/${villa.id}/tasks`, {
        body: {
          title: form.title,
          description: form.description || null,
          priority: form.priority,
          dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
          categoryId: form.categoryId || null,
          location: form.location || null,
          assigneeIds: assignees,
          checklist: checklist
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks', villa.id] });
      onClose();
    },
  });

  // Without `tasks:assign` a member may still create work, but only for
  // themselves — so the picker collapses to a single option.
  const assignable = can('tasks:assign')
    ? (members?.members ?? [])
    : (members?.members ?? []).filter((member) => member.id === membershipId);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal title="New task" onClose={onClose} wide>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <ErrorNote message={mutation.error instanceof ApiError ? mutation.error.message : null} />
        <Field label="What needs doing?">
          <input
            className="input"
            required
            autoFocus
            placeholder="Deep clean the guest suite"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </Field>
        <Field label="Details (optional)">
          <textarea
            className="input min-h-20"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Priority">
            <select
              className="input"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value as Task['priority'] })}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </Field>
          <Field label="Due (optional)">
            <input
              className="input"
              type="datetime-local"
              value={form.dueAt}
              onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
            />
          </Field>
          <Field label="Category">
            <select
              className="input"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">None</option>
              {categories?.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Location (optional)">
          <input
            className="input"
            placeholder="Pool area"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </Field>

        <fieldset>
          <legend className="label">Assign to</legend>
          <div className="flex flex-wrap gap-2">
            {assignable.map((member) => {
              const selected = assignees.includes(member.id);
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() =>
                    setAssignees((previous) =>
                      selected ? previous.filter((id) => id !== member.id) : [...previous, member.id],
                    )
                  }
                  className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-sm transition ${
                    selected
                      ? 'border-brand-500 bg-brand-50 text-brand-900'
                      : 'border-sand-300 bg-white text-slate-600 hover:border-brand-300'
                  }`}
                >
                  <Avatar name={member.fullName} colour={member.avatarColour} size="sm" />
                  {member.fullName}
                </button>
              );
            })}
            {assignable.length === 0 && <p className="text-sm text-slate-500">No one to assign yet.</p>}
          </div>
        </fieldset>

        <Field label="Checklist (optional)" hint="One item per line.">
          <textarea
            className="input min-h-20"
            placeholder={'Strip the beds\nRestock the minibar'}
            value={checklist}
            onChange={(e) => setChecklist(e.target.value)}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Create task
          </Button>
        </div>
      </form>
    </Modal>
  );
}

type TaskDetail = {
  task: Task;
  checklist: Array<{ id: string; label: string; isDone: boolean; position: number }>;
  comments: Array<{ id: string; body: string; author: string; avatar_colour: string; created_at: string }>;
};

function TaskDetailModal({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const { villa, can, membershipId } = useVilla();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');

  const { data, isPending } = useQuery({
    queryKey: ['task', villa.id, taskId],
    queryFn: () => api<TaskDetail>(`/villas/${villa.id}/tasks/${taskId}`),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['task', villa.id, taskId] });
    void queryClient.invalidateQueries({ queryKey: ['tasks', villa.id] });
  };

  const toggleItem = useMutation({
    mutationFn: ({ id, isDone }: { id: string; isDone: boolean }) =>
      api(`/villas/${villa.id}/tasks/${taskId}/checklist/${id}`, { method: 'PATCH', body: { isDone } }),
    onSuccess: invalidate,
  });

  const addComment = useMutation({
    mutationFn: () => api(`/villas/${villa.id}/tasks/${taskId}/comments`, { body: { body: comment } }),
    onSuccess: () => {
      setComment('');
      invalidate();
    },
  });

  const removeTask = useMutation({
    mutationFn: () => api(`/villas/${villa.id}/tasks/${taskId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks', villa.id] });
      onClose();
    },
  });

  if (isPending || !data) {
    return (
      <Modal title="Task" onClose={onClose}>
        <Spinner />
      </Modal>
    );
  }

  const editable = canMove(data.task, membershipId, can);

  return (
    <Modal title={data.task.title} description={data.task.reference} onClose={onClose} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={data.task.status} />
          <StatusPill status={data.task.priority} />
          {data.task.dueAt && <span className="text-xs text-slate-500">Due {formatDate(data.task.dueAt, villa.timezone)}</span>}
        </div>

        {data.task.description && (
          <p className="whitespace-pre-wrap text-sm text-slate-700">{data.task.description}</p>
        )}

        <div>
          <p className="label">Assigned to</p>
          <div className="flex flex-wrap gap-2">
            {data.task.assignees.map((assignee) => (
              <span
                key={assignee.membershipId}
                className="flex items-center gap-2 rounded-full border border-sand-200 px-2.5 py-1 text-sm text-slate-700"
              >
                <Avatar name={assignee.fullName} colour={assignee.avatarColour} size="sm" />
                {assignee.fullName}
              </span>
            ))}
            {data.task.assignees.length === 0 && <span className="text-sm text-slate-500">Nobody yet</span>}
          </div>
        </div>

        {data.checklist.length > 0 && (
          <div>
            <p className="label">Checklist</p>
            <ul className="space-y-1.5">
              {data.checklist.map((item) => (
                <li key={item.id}>
                  <label className="flex items-center gap-2.5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="rounded border-sand-300 text-brand-600 focus:ring-brand-500"
                      checked={item.isDone}
                      disabled={!editable}
                      onChange={(event) => toggleItem.mutate({ id: item.id, isDone: event.target.checked })}
                    />
                    <span className={item.isDone ? 'text-slate-400 line-through' : ''}>{item.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="label">Comments</p>
          <ul className="space-y-3">
            {data.comments.map((entry) => (
              <li key={entry.id} className="flex gap-2.5">
                <Avatar name={entry.author} colour={entry.avatar_colour} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-500">
                    <span className="font-medium text-slate-700">{entry.author}</span> ·{' '}
                    {relativeTime(entry.created_at)}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{entry.body}</p>
                </div>
              </li>
            ))}
            {data.comments.length === 0 && <li className="text-sm text-slate-500">No comments yet.</li>}
          </ul>

          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (comment.trim()) addComment.mutate();
            }}
          >
            <input
              className="input"
              placeholder="Add a comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <Button type="submit" loading={addComment.isPending} disabled={!comment.trim()}>
              Post
            </Button>
          </form>
        </div>

        {can('tasks:delete') && (
          <div className="flex justify-end border-t border-sand-100 pt-4">
            <Button variant="danger" loading={removeTask.isPending} onClick={() => removeTask.mutate()}>
              Delete task
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
