/**
 * Listing photos and videos.
 *   POST /api/media        multipart field "file" → { url, type }
 *   GET  /api/media/:name  serves the stored file
 *
 * Files live on local disk (MEDIA_DIR, default server/uploads). Listing metadata onchain stores
 * only the returned URL, so moving to S3 / R2 / IPFS later only changes this module.
 */

import express, { type Express, type Request, type Response } from 'express';
import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TYPES: Record<string, { ext: string; kind: 'image' | 'video'; maxBytes: number }> = {
  'image/jpeg': { ext: 'jpg', kind: 'image', maxBytes: 10 * 1024 * 1024 },
  'image/png': { ext: 'png', kind: 'image', maxBytes: 10 * 1024 * 1024 },
  'image/webp': { ext: 'webp', kind: 'image', maxBytes: 10 * 1024 * 1024 },
  'video/mp4': { ext: 'mp4', kind: 'video', maxBytes: 60 * 1024 * 1024 },
  'video/quicktime': { ext: 'mov', kind: 'video', maxBytes: 60 * 1024 * 1024 },
  'video/webm': { ext: 'webm', kind: 'video', maxBytes: 60 * 1024 * 1024 },
};
const MAX_UPLOADS_PER_HOUR = 60;

const mediaRoot = () => resolve(process.env.MEDIA_DIR || 'server/uploads');

/**
 * Download a remote file (e.g. a photo a landlord sent on WhatsApp — Twilio media needs basic auth)
 * into the media store. Returns the public URL, or null if the type/size isn't allowed or the fetch fails.
 */
export async function saveRemoteMedia(url: string, auth?: { user: string; pass: string }): Promise<{ url: string; type: 'image' | 'video' } | null> {
  try {
    const res = await fetch(url, {
      headers: auth ? { Authorization: `Basic ${Buffer.from(`${auth.user}:${auth.pass}`).toString('base64')}` } : {},
      signal: AbortSignal.timeout(30_000),
    });
    const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    const type = TYPES[mime];
    if (!res.ok || !type) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > type.maxBytes) return null;
    const root = mediaRoot();
    mkdirSync(root, { recursive: true });
    const name = `${randomBytes(12).toString('hex')}.${type.ext}`;
    writeFileSync(`${root}/${name}`, buf);
    return { url: `/api/media/${name}`, type: type.kind };
  } catch {
    return null;
  }
}

export function mountMedia(app: Express, dir?: string) {
  const root = dir ? resolve(dir) : mediaRoot();
  mkdirSync(root, { recursive: true });
  const perIp = new Map<string, { count: number; resetAt: number }>();

  const upload = multer({
    storage: multer.diskStorage({
      destination: root,
      filename: (_req, file, cb) => cb(null, `${randomBytes(12).toString('hex')}.${TYPES[file.mimetype]?.ext ?? 'bin'}`),
    }),
    limits: { fileSize: 60 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => cb(null, file.mimetype in TYPES),
  });

  app.post('/api/media', (req: Request, res: Response, next) => {
    const ip = req.ip ?? 'unknown';
    const now = Date.now();
    const entry = perIp.get(ip);
    if (entry && entry.resetAt > now && entry.count >= MAX_UPLOADS_PER_HOUR) {
      res.status(429).json({ error: 'Too many uploads. Try again later.' });
      return;
    }
    perIp.set(ip, !entry || entry.resetAt < now ? { count: 1, resetAt: now + 3_600_000 } : { ...entry, count: entry.count + 1 });
    next();
  }, upload.single('file'), (req: Request, res: Response) => {
    const file = req.file;
    const type = file && TYPES[file.mimetype];
    if (!file || !type) {
      res.status(400).json({ error: 'Upload a JPG, PNG or WebP photo, or an MP4, MOV or WebM video.' });
      return;
    }
    if (file.size > type.maxBytes) {
      res.status(413).json({ error: type.kind === 'image' ? 'Photos must be under 10 MB.' : 'Videos must be under 60 MB.' });
      return;
    }
    res.json({ url: `/api/media/${file.filename}`, type: type.kind });
  });

  // Only serve names we generated: 24 hex chars + known extension.
  app.get(/^\/api\/media\/([a-f0-9]{24}\.(?:jpg|png|webp|mp4|mov|webm))$/, (req: Request, res: Response) => {
    const name = (req.params as Record<string, string>)[0];
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(name, { root }, err => { if (err && !res.headersSent) res.status(404).end(); });
  });

  // Oversize uploads surface as multer errors.
  app.use('/api/media', ((err: unknown, _req: Request, res: Response, next: express.NextFunction) => {
    if (err instanceof multer.MulterError) {
      res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large.' : 'Upload failed.' });
      return;
    }
    next(err);
  }) as express.ErrorRequestHandler);
}
