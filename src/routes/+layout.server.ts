import { parseUnits, unitsForLocale } from '$core/units';
import type { LayoutServerLoad } from './$types';

/**
 * The reader's units, known before the first byte so a US visitor never sees
 * °C flash to °F: the `cultifolio.units` cookie when they have chosen, else
 * the browser's language. Nothing else about the reader is read here.
 */
export const load: LayoutServerLoad = ({ cookies, request }) => ({
  units: parseUnits(cookies.get('cultifolio.units')) ?? unitsForLocale(request.headers.get('accept-language'))
});
