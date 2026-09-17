import { json } from '@sveltejs/kit';
import { getIndex } from '$lib/server/dossiers';
import type { RequestHandler } from './$types';

/** The species index: which dossiers exist, for autocomplete and linking. */
export const GET: RequestHandler = async ({ platform, fetch }) => json(await getIndex(platform, fetch), { headers: { 'cache-control': 'public, max-age=300' } });
