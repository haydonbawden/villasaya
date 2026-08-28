import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { verifyAccessToken } from '../auth/tokens.ts';
import { query, queryOne } from '../db/index.ts';

export type RealtimeEvent =
  | { type: 'message.created'; villaId: string; channelId: string; payload: unknown }
  | { type: 'message.updated'; villaId: string; channelId: string; payload: unknown }
  | { type: 'message.deleted'; villaId: string; channelId: string; payload: unknown }
  | { type: 'notification.created'; villaId: string; payload: unknown }
  | { type: 'presence'; villaId: string; payload: unknown }
  | { type: 'typing'; villaId: string; channelId: string; payload: unknown }
  | { type: 'record.changed'; villaId: string; payload: unknown };

type Client = { socket: WebSocket; userId: string; villaIds: Set<string> };

const clients = new Set<Client>();

/** Every socket a given user currently has open (phone plus laptop, say). */
function socketsForUser(userId: string): Client[] {
  return [...clients].filter((client) => client.userId === userId);
}

function send(client: Client, event: RealtimeEvent): void {
  if (client.socket.readyState !== 1) return;
  try {
    client.socket.send(JSON.stringify(event));
  } catch {
    // A failed send means the socket is going away; the close handler cleans up.
  }
}

/** Delivers to the named users, but only on sockets scoped to that villa. */
export function emitToUsers(userIds: Iterable<string>, event: RealtimeEvent): void {
  const targets = new Set(userIds);
  for (const client of clients) {
    if (!targets.has(client.userId)) continue;
    if (!client.villaIds.has(event.villaId)) continue;
    send(client, event);
  }
}

/** Delivers to every active member of a villa. */
export function emitToVilla(villaId: string, event: RealtimeEvent): void {
  const members = query<{ user_id: string }>(
    "SELECT user_id FROM memberships WHERE villa_id = ? AND status = 'active'",
    [villaId],
  );
  emitToUsers(
    members.map((row) => row.user_id),
    event,
  );
}

/** Delivers to the members of one channel only. */
export function emitToChannel(villaId: string, channelId: string, event: RealtimeEvent): void {
  const members = query<{ user_id: string }>(
    `SELECT m.user_id
       FROM channel_members cm
       JOIN memberships m ON m.id = cm.membership_id
      WHERE cm.channel_id = ? AND m.status = 'active'`,
    [channelId],
  );
  emitToUsers(
    members.map((row) => row.user_id),
    event,
  );
}

export function connectedUserIds(villaId: string): string[] {
  const seen = new Set<string>();
  for (const client of clients) {
    if (client.villaIds.has(villaId)) seen.add(client.userId);
  }
  return [...seen];
}

/**
 * Attaches the WebSocket endpoint at `/ws`.
 *
 * The access token arrives as a query parameter because browsers cannot set
 * headers on a WebSocket handshake. It is verified before the socket is
 * accepted, and the villa list is read from the database rather than trusted
 * from the client, so a socket can only ever receive events for villas the user
 * is actually a member of.
 */
export function attachRealtime(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    const token = url.searchParams.get('token');
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    let userId: string;
    try {
      userId = verifyAccessToken(token).sub;
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    const user = queryOne<{ id: string }>('SELECT id FROM users WHERE id = ? AND is_active = 1', [userId]);
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      registerClient(ws, userId);
      wss.emit('connection', ws, request);
    });
  });

  return wss;
}

function registerClient(socket: WebSocket, userId: string): void {
  const villaIds = new Set(
    query<{ villa_id: string }>(
      "SELECT villa_id FROM memberships WHERE user_id = ? AND status = 'active'",
      [userId],
    ).map((row) => row.villa_id),
  );
  const client: Client = { socket, userId, villaIds };
  clients.add(client);

  let alive = true;
  socket.on('pong', () => {
    alive = true;
  });
  const heartbeat = setInterval(() => {
    if (!alive) {
      socket.terminate();
      return;
    }
    alive = false;
    socket.ping();
  }, 30_000);

  socket.on('message', (raw) => {
    // The client may relay ephemeral typing indicators; nothing persistent is
    // ever accepted over the socket, so an untrusted payload is harmless.
    try {
      const parsed = JSON.parse(String(raw)) as { type?: string; villaId?: string; channelId?: string };
      if (parsed.type === 'typing' && parsed.villaId && parsed.channelId && client.villaIds.has(parsed.villaId)) {
        emitToChannel(parsed.villaId, parsed.channelId, {
          type: 'typing',
          villaId: parsed.villaId,
          channelId: parsed.channelId,
          payload: { userId },
        });
      }
    } catch {
      // Ignore malformed frames.
    }
  });

  socket.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(client);
  });
  socket.on('error', () => {
    clearInterval(heartbeat);
    clients.delete(client);
  });
}

/** Called when a membership is created or removed so open sockets stay accurate. */
export function refreshVillaAccess(userId: string): void {
  const villaIds = new Set(
    query<{ villa_id: string }>(
      "SELECT villa_id FROM memberships WHERE user_id = ? AND status = 'active'",
      [userId],
    ).map((row) => row.villa_id),
  );
  for (const client of socketsForUser(userId)) {
    client.villaIds = villaIds;
  }
}

/** Test hook: drops all registered sockets. */
export function resetRealtime(): void {
  clients.clear();
}
