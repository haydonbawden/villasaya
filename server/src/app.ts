import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';
import { errorHandler, notFoundHandler, requestId } from './lib/http.ts';
import { authRouter } from './routes/auth.ts';
import { villasRouter } from './routes/villas.ts';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(requestId);
  // CORS only matters when the client is served from somewhere else — the dev
  // server, or a separately hosted front end. When this process serves the SPA
  // too, every request is same-origin and this is a no-op.
  app.use(
    cors({
      origin: config.appUrl,
      credentials: true,
      exposedHeaders: ['X-Request-Id'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/villas', villasRouter);

  // An unknown /api path is a 404 from the API, never the SPA shell — a client
  // calling a mistyped endpoint should get JSON, not a page of HTML.
  app.use('/api', notFoundHandler);

  if (config.webDist) {
    serveWebClient(app, config.webDist);
  } else {
    app.use(notFoundHandler);
  }

  app.use(errorHandler);

  return app;
}

/**
 * Serves the built SPA alongside the API.
 *
 * Hashed asset filenames are immutable, so they get a long cache; index.html
 * must not be cached or a browser would keep loading a stale build that points
 * at assets which no longer exist. Anything not matching a file falls back to
 * index.html so client-side routes survive a refresh or a shared link.
 */
function serveWebClient(app: Express, webDist: string): void {
  const indexHtml = path.join(webDist, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    console.warn(`[server] WEB_DIST is set to ${webDist} but it has no index.html; serving the API only`);
    app.use(notFoundHandler);
    return;
  }

  app.use(
    express.static(webDist, {
      index: false,
      maxAge: '1y',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );

  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
}
