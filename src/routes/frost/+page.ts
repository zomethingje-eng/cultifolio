import { redirect } from '@sveltejs/kit';

/** The frost watch is the top of the Today tab now (round fifty-three, 3); the old address goes there. */
export const load = () => {
  redirect(301, '/today');
};
