import { parseUnits, unitsForLocale, type Units } from '$core/units';
import type { Cookies } from '@sveltejs/kit';

/**
 * The reader's units for a server-rendered page: the `cultifolio.units` cookie when they have chosen, else the browser's
 * language. Only the pages rendered on the server return this (the species page, the front page, compare, settings);
 * a root layout load would make every client-rendered page fetch it from the server on load, which the collection's
 * pages must never need, since they work offline.
 */
export function unitsFor(cookies: Cookies, request: Request): Units {
  return parseUnits(cookies.get('cultifolio.units')) ?? unitsForLocale(request.headers.get('accept-language'));
}
