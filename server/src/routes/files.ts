import { Router, raw } from 'express';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.ts';
import { execute, queryOne } from '../db/index.ts';
import { asyncHandler, requirePermission } from '../auth/middleware.ts';
import { requireAuth, requireVilla } from '../auth/context.ts';
import { badRequest, notFound, tooLarge } from '../lib/errors.ts';
import { newId } from '../lib/ids.ts';

export const filesRouter = Router({ mergeParams: true });

// Receipt photos and message images only. An allowlist rather than a blocklist,
// so nothing executable can be stored and served back.
const ALLOWED_TYPES = new Map<string, string>([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/heic', '.heic'],
  ['application/pdf', '.pdf'],
]);

function safeFilename(raw: string | undefined, extension: string): string {
  const base = (raw ?? 'upload')
    .split(/[\\/]/)
    .pop()!
    .replace(/[^\w. -]/g, '')
    .slice(0, 80)
    .trim();
  const withoutExtension = base.replace(/\.[^.]*$/, '') || 'upload';
  return `${withoutExtension}${extension}`;
}

/**
 * Raw-body upload rather than multipart: the client sends the bytes with a
 * Content-Type and an X-Filename header. One file per request keeps the parser
 * trivial and avoids a multipart dependency for what is only ever a photo of a
 * receipt.
 */
filesRouter.post(
  '/',
  requirePermission('files:upload'),
  raw({ type: () => true, limit: config.maxUploadBytes }),
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    const villa = requireVilla(req);

    const mimeType = (req.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    const extension = ALLOWED_TYPES.get(mimeType);
    if (!extension) {
      throw badRequest('Only JPEG, PNG, WebP, HEIC images and PDFs can be uploaded', {
        allowed: [...ALLOWED_TYPES.keys()],
      });
    }
    const body = req.body as Buffer | undefined;
    if (!Buffer.isBuffer(body) || body.byteLength === 0) throw badRequest('No file content was received');
    if (body.byteLength > config.maxUploadBytes) {
      throw tooLarge(`Files must be ${Math.floor(config.maxUploadBytes / 1024 / 1024)}MB or smaller`);
    }

    const attachmentId = newId();
    const checksum = createHash('sha256').update(body).digest('hex');
    // Files are partitioned by villa on disk, which keeps one tenant's uploads
    // in one place and makes per-villa deletion straightforward.
    const relativeKey = path.join(villa.villaId, `${attachmentId}${extension}`);
    const absolutePath = path.join(config.uploadDir, relativeKey);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, body);

    const filename = safeFilename(req.get('x-filename'), extension);
    execute(
      `INSERT INTO attachments (id, villa_id, uploaded_by, filename, mime_type, byte_size, storage_key, checksum, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [attachmentId, villa.villaId, auth.userId, filename, mimeType, body.byteLength, relativeKey, checksum, new Date().toISOString()],
    );

    res.status(201).json({
      attachment: {
        id: attachmentId,
        filename,
        mimeType,
        byteSize: body.byteLength,
        url: `/api/villas/${villa.villaId}/files/${attachmentId}`,
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// GET /files/:attachmentId
// ---------------------------------------------------------------------------
filesRouter.get(
  '/:attachmentId',
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const attachment = queryOne<{ id: string; filename: string; mime_type: string; storage_key: string }>(
      'SELECT id, filename, mime_type, storage_key FROM attachments WHERE id = ? AND villa_id = ?',
      [String(req.params.attachmentId), villa.villaId],
    );
    if (!attachment) throw notFound('File not found');

    const absolutePath = path.join(config.uploadDir, attachment.storage_key);
    // Defence in depth against a crafted storage_key escaping the upload root.
    if (!absolutePath.startsWith(path.resolve(config.uploadDir) + path.sep)) throw notFound('File not found');
    if (!fs.existsSync(absolutePath)) throw notFound('File not found');

    res.setHeader('Content-Type', attachment.mime_type);
    // `attachment` rather than `inline`: a stored PDF or image is never
    // rendered in the app's own origin, so a malicious upload cannot script.
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    fs.createReadStream(absolutePath).pipe(res);
  }),
);
