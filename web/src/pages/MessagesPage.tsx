import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../lib/api.ts';
import { useVilla } from '../context/VillaContext.tsx';
import { useIsSplitLayout } from '../lib/useMediaQuery.ts';
import { usePageTitle } from '../lib/usePageTitle.ts';
import { relativeTime } from '../lib/format.ts';
import {
  Avatar,
  Button,
  EmptyState,
  ErrorNote,
  Field,
  LoadError,
  Modal,
  Skeleton,
  Spinner,
} from '../components/ui.tsx';
import { IconChevronLeft, IconMessages, IconPlus, IconSend } from '../components/icons.tsx';
import type { Channel, Member, Message } from '../lib/types.ts';

export function MessagesPage() {
  const { villa, can, membershipId } = useVilla();
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isSplit = useIsSplitLayout();
  const [composing, setComposing] = useState<'channel' | 'direct' | null>(null);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['channels', villa.id],
    queryFn: () => api<{ channels: Channel[] }>(`/villas/${villa.id}/messages/channels`),
  });

  const channels = data?.channels ?? [];
  const active = channels.find((channel) => channel.id === channelId) ?? null;

  usePageTitle(
    active ? (active.kind === 'channel' ? `#${active.name}` : active.name) : 'Messages',
    villa.name,
  );

  // On a wide layout the thread pane would otherwise sit empty, so open the
  // first conversation. On a phone the list is a screen in its own right and
  // must not skip past itself.
  useEffect(() => {
    if (!isSplit || channelId || channels.length === 0) return;
    navigate(`/villas/${villa.id}/messages/${channels[0]!.id}`, {
      replace: true,
    });
  }, [isSplit, channelId, channels, navigate, villa.id]);

  const markRead = useMutation({
    mutationFn: (id: string) =>
      api(`/villas/${villa.id}/messages/channels/${id}/read`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['channels', villa.id] }),
  });

  useEffect(() => {
    if (active?.id && active.unreadCount > 0) markRead.mutate(active.id);
    // Marking read follows the selected conversation, not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  if (isError) {
    return (
      <div className="mx-auto max-w-7xl">
        <LoadError
          message={error instanceof ApiError ? error.message : null}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  // Which pane a phone shows is decided by whether a conversation is selected.
  const showList = isSplit || !channelId;
  const showThread = isSplit || Boolean(channelId);

  return (
    <div className="mx-auto flex h-[calc(100dvh-8.5rem)] max-w-7xl gap-4 lg:h-[calc(100dvh-9.5rem)]">
      {showList && (
        <aside className={`flex min-w-0 flex-col ${isSplit ? 'w-72 shrink-0' : 'w-full'}`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h1 className="text-lg font-semibold text-slate-900">Messages</h1>
          </div>
          <div className="mb-3 flex gap-2">
            {can('messages:manage_channels') && (
              <Button
                variant="secondary"
                className="flex-1 !px-2 text-xs"
                onClick={() => setComposing('channel')}
              >
                <IconPlus size={15} /> Channel
              </Button>
            )}
            <Button
              variant="secondary"
              className="flex-1 !px-2 text-xs"
              onClick={() => setComposing('direct')}
            >
              <IconPlus size={15} /> Direct
            </Button>
          </div>

          <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-2">
            {isPending ? (
              <div className="space-y-2" role="status" aria-label="Loading conversations">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-11 w-full" />
                ))}
              </div>
            ) : channels.length === 0 ? (
              <EmptyState
                title="No conversations yet"
                description="Start a channel or send someone a direct message."
              />
            ) : (
              <>
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
              </>
            )}
          </nav>
        </aside>
      )}

      {showThread && (
        <section className="card flex min-w-0 flex-1 flex-col">
          {active ? (
            <ChannelView
              channel={active}
              selfMembershipId={membershipId}
              canSend={can('messages:send')}
              showBack={!isSplit}
              backTo={`/villas/${villa.id}/messages`}
            />
          ) : isPending ? (
            <Spinner label="Loading conversation" />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState
                title="Pick a conversation"
                description="Choose a channel or direct message from the list."
              />
            </div>
          )}
        </section>
      )}

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
            <Link
              to={`/villas/${villaId}/messages/${channel.id}`}
              aria-current={channel.id === activeId ? 'page' : undefined}
              className={`flex min-h-11 items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm ${
                channel.id === activeId
                  ? 'bg-brand-50 font-medium text-brand-800'
                  : 'text-slate-700 hover:bg-sand-100'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {channel.kind === 'channel' ? (
                  <span className="text-slate-400" aria-hidden="true">
                    #
                  </span>
                ) : (
                  <IconMessages size={15} className="shrink-0 text-slate-400" />
                )}
                <span className="truncate">{channel.name}</span>
              </span>
              {channel.unreadCount > 0 && (
                <span className="shrink-0 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {channel.unreadCount > 99 ? '99+' : channel.unreadCount}
                </span>
              )}
            </Link>
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
  showBack,
  backTo,
}: {
  channel: Channel;
  selfMembershipId: string;
  canSend: boolean;
  showBack: boolean;
  backTo: string;
}) {
  const { villa } = useVilla();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isPending } = useQuery({
    queryKey: ['messages', villa.id, channel.id],
    queryFn: () =>
      api<{ messages: Message[]; hasMore: boolean }>(
        `/villas/${villa.id}/messages/channels/${channel.id}/messages`,
      ),
  });

  const send = useMutation({
    mutationFn: () =>
      api(`/villas/${villa.id}/messages/channels/${channel.id}/messages`, {
        body: { body: draft },
      }),
    onSuccess: () => {
      setDraft('');
      void queryClient.invalidateQueries({
        queryKey: ['messages', villa.id, channel.id],
      });
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

  const title = channel.kind === 'channel' ? `# ${channel.name}` : channel.name;

  return (
    <>
      <header className="flex shrink-0 items-center gap-2 border-b border-sand-200 px-2 py-2.5 sm:px-4">
        {showBack && (
          <Link
            to={backTo}
            aria-label="Back to conversations"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-sand-100"
          >
            <IconChevronLeft size={20} />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-slate-900">{title}</h2>
          <p className="truncate text-xs text-slate-500">
            {channel.topic ??
              `${channel.members.length} ${channel.members.length === 1 ? 'person' : 'people'}`}
          </p>
        </div>
      </header>

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4 sm:px-4">
        {/* `mt-auto` sits the thread on the composer the way a chat app should:
            a short conversation starts at the bottom of the pane, not adrift at
            the top of it, and a long one still scrolls normally. */}
        <div className="mt-auto space-y-3">
          {isPending && (
            <div className="space-y-3" role="status" aria-label="Loading messages">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="flex gap-2.5">
                  <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                  <Skeleton className="h-12 w-2/3 rounded-2xl" />
                </div>
              ))}
            </div>
          )}
          {!isPending && (data?.messages.length ?? 0) === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">No messages yet — say hello.</p>
          )}
          {data?.messages.map((message) => {
            const own = message.author.membershipId === selfMembershipId;
            return (
              <article key={message.id} className={`flex gap-2.5 ${own ? 'flex-row-reverse' : ''}`}>
                <Avatar name={message.author.fullName} colour={message.author.avatarColour} size="sm" />
                <div className={`min-w-0 max-w-[80%] sm:max-w-[75%] ${own ? 'text-right' : ''}`}>
                  <p className="text-xs text-slate-500">
                    <span className="font-medium text-slate-700">
                      {own ? 'You' : message.author.fullName}
                    </span>{' '}
                    · {relativeTime(message.createdAt)}
                    {message.editedAt && ' · edited'}
                  </p>
                  <div
                    className={`mt-1 inline-block whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
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
      </div>

      {canSend ? (
        <form
          onSubmit={onSubmit}
          className="flex shrink-0 gap-2 border-t border-sand-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <label htmlFor="message-composer" className="sr-only">
            Message {title}
          </label>
          <input
            id="message-composer"
            className="input"
            placeholder={`Message ${title}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" loading={send.isPending} disabled={!draft.trim()} aria-label="Send message">
            <IconSend size={16} />
            <span className="hidden sm:inline">Send</span>
          </Button>
        </form>
      ) : (
        <p className="shrink-0 border-t border-sand-200 p-3 text-center text-xs text-slate-500">
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
            body: {
              name,
              topic: topic || undefined,
              isPrivate,
              memberIds: selected,
            },
          })
        : api<{ channel: Channel }>(`/villas/${villa.id}/messages/direct`, {
            body: { membershipIds: selected },
          }),
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
    <Modal
      title={kind === 'channel' ? 'New channel' : 'New direct message'}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="compose-form"
            loading={mutation.isPending}
            disabled={kind === 'direct' && selected.length === 0}
          >
            {kind === 'channel' ? 'Create channel' : 'Start conversation'}
          </Button>
        </div>
      }
    >
      <form id="compose-form" onSubmit={onSubmit} className="space-y-4" noValidate>
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
            <label className="flex min-h-11 items-center gap-2.5 text-sm text-slate-700">
              <input
                type="checkbox"
                className="checkbox"
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
                  aria-pressed={active}
                  onClick={() =>
                    setSelected((previous) =>
                      active ? previous.filter((id) => id !== member.id) : [...previous, member.id],
                    )
                  }
                  className={`flex min-h-11 items-center gap-2 rounded-full border px-3 py-1 text-sm transition ${
                    active
                      ? 'border-brand-600 bg-brand-50 text-brand-900'
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
      </form>
    </Modal>
  );
}
