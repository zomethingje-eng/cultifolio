import { unitsFor } from '$lib/server/units';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ cookies, request, setHeaders }) => {
  setHeaders({ 'cache-control': 'private, max-age=60', vary: 'accept-language, cookie' });
  return { units: unitsFor(cookies, request) };
};
