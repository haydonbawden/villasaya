import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getAccessToken } from './api.ts';

type RealtimeEvent = {
  type: string;
  villaId: string;
  channelId?: string;
  payload?: unknown;
};

/**
 * Keeps the open screen live.
 *
 * The socket is a cache-invalidation signal rather than a data channel: an
 * event tells React Query which slice is stale and the refetch goes through the
 * normal permission-checked endpoints. That way a pushed event can never show a
 * user data their role would not otherwise return.
 */
export function useRealtime(villaId: string | undefined, onEvent?: (event: RealtimeEvent) => void): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!villaId) return;
    const token = getAccessToken();
    if (!token) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let attempts = 0;
    let closedByUs = false;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);

      socket.onopen = () => {
        attempts = 0;
      };

      socket.onmessage = (message) => {
        let event: RealtimeEvent;
        try {
          event = JSON.parse(String(message.data)) as RealtimeEvent;
        } catch {
          return;
        }
        if (event.villaId !== villaId) return;

        switch (event.type) {
          case 'message.created':
          case 'message.updated':
          case 'message.deleted':
            void queryClient.invalidateQueries({ queryKey: ['messages', villaId, event.channelId] });
            void queryClient.invalidateQueries({ queryKey: ['channels', villaId] });
            break;
          case 'notification.created':
            void queryClient.invalidateQueries({ queryKey: ['notifications', villaId] });
            break;
          case 'record.changed': {
            const resource = (event.payload as { resource?: string } | undefined)?.resource;
            if (resource) void queryClient.invalidateQueries({ queryKey: [resource, villaId] });
            void queryClient.invalidateQueries({ queryKey: ['dashboard', villaId] });
            break;
          }
          default:
            break;
        }
        onEvent?.(event);
      };

      socket.onclose = () => {
        if (closedByUs) return;
        // Exponential backoff, capped, so a server restart does not turn into a
        // reconnect storm from every open tab.
        attempts += 1;
        const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempts, 5));
        reconnectTimer = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closedByUs = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [villaId, queryClient, onEvent]);
}
