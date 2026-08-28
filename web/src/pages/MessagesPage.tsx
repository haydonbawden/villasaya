import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../lib/api.ts';
import { useVilla } from '../context/VillaContext.tsx';
import { relativeTime } from '../lib/format.ts';
import { Avatar, Button, EmptyState, ErrorNote, Field, Modal, Spinner } from '../components/ui.tsx';
import type { Channel, Member, Message } from '../lib/types.ts';

export function MessagesPage() {
  const { villa, can, membershipId } = useVilla();
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [composing, setComposing] = useState<'channel' | 'direct' | null>(null);

  const { data: channelData, isPending } = useQuery({
    queryKey: ['channels', villa.id],
    queryFn: () => api<{ channels: Channel[] }>(`/villas/${villa.id}/messages/channels`),
  });

  const channels = channelData?.channels ?? [];
  const active = channels.find((channel) => channel.id === channelId) ?? channels[0];

  // Deep-linking to /messages lands on the first channel rather than an empty pane.
  useEffect(() => {
    if (!channelId && active) navigate(`/villas/${villa.id}/messages/${active.id}`, { replace: true });
  }, [channelId, active, navigate, villa.id]);

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/villas/${villa.id}/messages/channels/${id}/read`, { method: 'POST', body: {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['channels', villa.id] }),
  });

  useEffect(() => {
    if (active?.id && active.unreadCount > 0) markRead.mutate(active.id);
    // Marking read follows the selected channel, not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  if (isPending) return <Spinner label="Loading conversations" />;

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] max-w-7xl gap-4">
      <aside className="hidden w-64 shrink-0 flex-col md:flex">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-900">Messages</h1>
        </div>
        <div className="mb-3 flex gap-2">
          {can('messages:manage_channels') && (
            <Button variant="secondary" className="flex-1 !px-2 text-xs" onClick={() => setComposing('channel')}>
              + Channel
            </Button>
          )}
          <Button variant="secondary" className="flex-1 !px-2 text-xs" onClick={() => setComposing('direct')}>
            + Direct
          </Button>
        </div>

        <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <ChannelGroup
            label="Channels"
            channels={channels.filter((channel) => channel.kind === 'channel')}
            activeId={active?.id}
            villaId={villa.id}
          />
          <ChannelGroup
            label="Direct messages"
            channels={channels.filter((channel) => channel.kind === 'direct')}
            activeId={active?.id}
            villaId={villa.id}
          />
        </nav>
      </aside>

      <section className="card flex min-w-0 flex-1 flex-col">
        {active ? (
          <ChannelView channel={active} selfMembershipId={membershipId} canSend={can('messages:send')} />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState title="No conversations yet" description="Start a channel or send someone a direct message." />
          </div>
        )}
      </section>

      {composing && <ComposeModal kind={composing} onClose={() => setComposing(null)} />}
    </div>
  );
}

function ChannelGroup({
  label,
  channels,
  activeId,
  villaId,
}: {
  label: string;
  channels: Channel[];
  activeId: string | undefined;
  villaId: string;
}) {
  if (channels.length === 0) return null;
  return (
    <div>
      <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <ul className="space-y-0.5">
        {channels.map((channel) => (
          <li key={channel.id}>
            <a
              href={`/villas/${villaId}/messages/${channel.id}`}
              className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm ${
                channel.id === activeId ? 'bg-brand-50 font-medium text-brand-800' : 'text-slate-700 hover:bg-sand-100'
              }`}
            >
              <span className="truncate">
                {channel.kind === 'channel' ? `# ${channel.name}` : channel.name}
              </span>
              {channel.unreadCount > 0 && (
                <span className="shrink-0 rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white">
                  {channel.unreadCount}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChannelView({
  channel,
  selfMembershipId,
  canSend,
}: {
  channel: Channel;
  selfMembershipId: string;
  canSend: boolean;
}) {
  const { villa } = useVilla();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isPending } = useQuery({
    queryKey: ['messages', villa.id, channel.id],
    queryFn: () =>
      api<{ messages: Message[]; hasMore: boolean }>(`/villas/${villa.id}/messages/channels/${channel.id}/messages`),
  });

  const send = useMutation({
    mutationFn: () =>
      api(`/villas/${villa.id}/messages/channels/${channel.id}/messages`, { body: { body: draft } }),
    onSuccess: () => {
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: ['messages', villa.id, channel.id] });
    },
  });

  // Stick to the newest message whenever the thread grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [data?.messages.length]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (draft.trim()) send.mutate();
  }

  return (
    <>
      <header className="border-b border-sand-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">
          {channel.kind === 'channel' ? `# ${channel.name}` : channel.name}
        </h2>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {channel.topic ??
            `${channel.members.length} ${channel.members.length === 1 ? 'person' : 'people'}`}
        </p>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {isPending && <Spinner label="Loading messages" />}
        {!isPending && (data?.messages.length ?? 0) === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">No messages yet — say hello.</p>
        )}
        {data?.messages.map((message) => {
          const own = message.author.membershipId === selfMembershipId;
          return (
            <article key={message.id} className={`flex gap-2.5 ${own ? 'flex-row-reverse' : ''}`}>
              <Avatar name={message.author.fullName} colour={message.author.avatarColour} size="sm" />
              <div className={`min-w-0 max-w-[75%] ${own ? 'text-right' : ''}`}>
                <p className="text-xs text-slate-500">
                  <span className="font-medium text-slate-700">{own ? 'You' : message.author.fullName}</span>{' '}
                  · {relativeTime(message.createdAt)}
                  {message.editedAt && ' · edited'}
                </p>
                <div
                  className={`mt-1 inline-block whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                    message.deleted
                      ? 'bg-sand-100 italic text-slate-400'
                      : own
                        ? 'bg-brand-700 text-white'
                        : 'bg-sand-100 text-slate-800'
                  }`}
                >
                  {message.deleted ? 'This message was removed' : message.body}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {canSend ? (
        <form onSubmit={onSubmit} className="flex gap-2 border-t border-sand-200 p-3">
          <input
            className="input"
            placeholder={`Message ${channel.kind === 'channel' ? `#${channel.name}` : channel.name}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" loading={send.isPending} disabled={!draft.trim()}>
            Send
          </Button>
        </form>
      ) : (
        <p className="border-t border-sand-200 p-3 text-center text-xs text-slate-500">
          You have read-only access to messages.
        </p>
      )}
    </>
  );
}

function ComposeModal({ kind, onClose }: { kind: 'channel' | 'direct'; onClose: () => void }) {
  const { villa } = useVilla();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const { data: members } = useQuery({
    queryKey: ['members', villa.id],
    queryFn: () => api<{ members: Member[] }>(`/villas/${villa.id}/members`),
  });

  const mutation = useMutation({
    mutationFn: () =>
      kind === 'channel'
        ? api<{ channel: Channel }>(`/villas/${villa.id}/messages/channels`, {
            body: { name, topic: topic || undefined, isPrivate, memberIds: selected },
          })
        : api<{ channel: Channel }>(`/villas/${villa.id}/messages/direct`, { body: { membershipIds: selected } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['channels', villa.id] });
      navigate(`/villas/${villa.id}/messages/${result.channel.id}`);
      onClose();
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal title={kind === 'channel' ? 'New channel' : 'New direct message'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <ErrorNote message={mutation.error instanceof ApiError ? mutation.error.message : null} />
        {kind === 'channel' && (
          <>
            <Field label="Channel name">
              <input
                className="input"
                required
                autoFocus
                placeholder="maintenance"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Topic (optional)">
              <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="rounded border-sand-300 text-brand-600 focus:ring-brand-500"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
              />
              Private — only invited people can see it
            </label>
          </>
        )}

        <fieldset>
          <legend className="label">{kind === 'channel' ? 'Add people' : 'Message who?'}</legend>
          <div className="flex max-h-60 flex-wrap gap-2 overflow-y-auto">
            {members?.members.map((member) => {
              const active = selected.includes(member.id);
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() =>
                    setSelected((previous) =>
                      active ? previous.filter((id) => id !== member.id) : [...previous, member.id],
                    )
                  }
                  className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-sm transition ${
                    active
                      ? 'border-brand-500 bg-brand-50 text-brand-900'
                      : 'border-sand-300 bg-white text-slate-600 hover:border-brand-300'
                  }`}
                >
                  <Avatar name={member.fullName} colour={member.avatarColour} size="sm" />
                  {member.fullName}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={mutation.isPending}
            disabled={kind === 'direct' && selected.length === 0}
          >
            {kind === 'channel' ? 'Create channel' : 'Start conversation'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
