import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { useVilla } from '../context/VillaContext.tsx';
import { relativeTime } from '../lib/format.ts';
import type { Notification } from '../lib/types.ts';

export function NotificationBell() {
  const { villa } = useVilla();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['notifications', villa.id],
    queryFn: () => api<{ notifications: Notification[]; unreadCount: number }>(`/villas/${villa.id}/notifications`),
    // The socket invalidates this on new events; the interval is a safety net
    // for a dropped connection.
    refetchInterval: 120_000,
  });

  const markRead = useMutation({
    mutationFn: () => api(`/villas/${villa.id}/notifications/read`, { method: 'POST', body: {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', villa.id] }),
  });

  const unread = data?.unreadCount ?? 0;

  return (
    <div className="relative">
      <button
        type="button"
        className="relative rounded-lg px-2 py-1.5 text-lg hover:bg-sand-100"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-xl border border-sand-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-sand-200 px-4 py-2.5">
              <span className="text-sm font-semibold text-slate-800">Notifications</span>
              {unread > 0 && (
                <button
                  type="button"
                  className="text-xs font-medium text-brand-700 hover:underline"
                  onClick={() => markRead.mutate()}
                >
                  Mark all read
                </button>
              )}
            </div>
            <ul className="max-h-96 overflow-y-auto">
              {(data?.notifications ?? []).length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-slate-500">Nothing yet.</li>
              )}
              {data?.notifications.map((notification) => {
                const content = (
                  <>
                    <span className="block text-sm font-medium text-slate-800">{notification.title}</span>
                    {notification.body && (
                      <span className="mt-0.5 block truncate text-xs text-slate-500">{notification.body}</span>
                    )}
                    <span className="mt-1 block text-[11px] text-slate-400">
                      {relativeTime(notification.createdAt)}
                    </span>
                  </>
                );
                return (
                  <li key={notification.id} className={notification.readAt ? '' : 'bg-brand-50/60'}>
                    {notification.link ? (
                      <Link
                        to={notification.link}
                        className="block border-b border-sand-100 px-4 py-3 hover:bg-sand-50"
                        onClick={() => setOpen(false)}
                      >
                        {content}
                      </Link>
                    ) : (
                      <div className="border-b border-sand-100 px-4 py-3">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
