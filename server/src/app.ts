import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { config } from './config.ts';
import { errorHandler, notFoundHandler, requestId } from './lib/http.ts';
import { authRouter } from './routes/auth.ts';
import { villasRouter } from './routes/villas.ts';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestId);
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

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
