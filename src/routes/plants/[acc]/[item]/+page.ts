/**
 * An item's number typed or linked with its "/" bare (round eighty-seven, t1): /plants/2026-0012/A is the page of item A of
 * 2026-0012, whose own address carries the "/" as %2F (`plantHref`). A version of the app before round eighty-seven links
 * an item this way, since it does not know the "/" is part of the number. Anything after the number but a letter or two
 * is no page.
 */
import { error, redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
  if (/^[A-Z]{1,2}$/.test(params.item)) redirect(307, `/plants/${encodeURIComponent(`${params.acc}/${params.item}`)}`);
  error(404, 'Not found');
};
