import type { ErrorRequestHandler, RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { config } from '../config.ts';
import { HttpError } from './errors.ts';

export const requestId: RequestHandler = (req, res, next) => {
  const id = req.get('x-request-id') ?? randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'No such endpoint' } });
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (res.headersSent) return;

  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
      requestId: req.requestId,
    });
    return;
  }

  // A constraint violation that reaches here is a bug, but returning 500 with a
  // stack trace would be worse than a generic conflict response.
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('UNIQUE constraint failed')) {
    res.status(409).json({
      error: { code: 'conflict', message: 'That record already exists' },
      requestId: req.requestId,
    });
    return;
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, error);
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'Something went wrong on our end',
      details: config.isProduction ? null : message,
    },
    requestId: req.requestId,
  });
};
