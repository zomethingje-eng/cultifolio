import { json } from '@sveltejs/kit';
import { today } from '../today.server';
import { limited } from '$lib/server/sync';
import type { RequestHandler } from './$types';

/**
 * GET /about/data/today: the species of the day, for the not-found page (round eighty-seven; plan D7), which has no load
 * of its own to read it with. `{ today: null }` when there is nothing true to show (no pool, the record not read); the
 * page then shows its search and links alone. Public for five minutes: the same for every reader, and the pick turns at
 * midnight UTC. Nothing of the reader's is asked or answered. A dossier is read for it, so it is counted per address as a
 * reference read is (`limited`, 'reference'), as /api/dossier is; past the count the page shows no plant.
 */
export const GET: RequestHandler = async ({ platform, fetch, getClientAddress }) => {
  const stop = await limited(platform, getClientAddress, 'reference');
  if (stop) return stop;
  const t = await today(platform, fetch).catch(() => null);
  return json({ today: t ? { ...t, downloads: undefined } : null }, { headers: { 'cache-control': t ? 'public, max-age=300' : 'no-store' } });
};
