import http from 'node:http';
import fs from 'node:fs';
import { createApp } from './app.ts';
import { config } from './config.ts';
import { migrate } from './db/index.ts';
import { attachRealtime } from './realtime/hub.ts';

const applied = migrate();
if (applied.length > 0) console.log(`[db] applied migrations: ${applied.join(', ')}`);
fs.mkdirSync(config.uploadDir, { recursive: true });

const server = http.createServer(createApp());
attachRealtime(server);

server.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port} (${config.nodeEnv})`);
  console.log(
    config.webDist
      ? `[server] serving the web client from ${config.webDist}`
      : `[server] expecting the web client at ${config.appUrl}`,
  );
  if (config.isProduction && !config.cookieSecure) {
    console.warn(
      '[server] WARNING: COOKIE_SECURE is off, so session cookies will travel unencrypted. ' +
        'Only acceptable behind plain HTTP while a domain and certificate are pending.',
    );
  }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`\n[server] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
    // Force exit if sockets keep the server open past the grace period.
    setTimeout(() => process.exit(0), 5_000).unref();
  });
}
