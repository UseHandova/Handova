/**
 * Platform moderation: listings hidden from tenants (scams, spam, test data). The escrow only lets a
 * listing's owner deactivate it, so takedowns live here and the app filters them out.
 *   GET /api/moderation/hidden → { listingIds: string[] }
 * Edit server/data/moderation.json (or add an admin UI) to change the list.
 */

import type { Express } from 'express';
import { readFileSync } from 'node:fs';

const FILE = process.env.MODERATION_FILE || 'server/data/moderation.json';

export function hiddenListingIds(): string[] {
  try {
    const d = JSON.parse(readFileSync(FILE, 'utf8')) as { hiddenListings?: { id: string }[] };
    return (d.hiddenListings ?? []).map(h => String(h.id));
  } catch {
    return [];
  }
}

export function mountModeration(app: Express) {
  app.get('/api/moderation/hidden', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({ listingIds: hiddenListingIds() });
  });
}
