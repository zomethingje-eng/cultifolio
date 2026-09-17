import { redirect } from '@sveltejs/kit';
/** The v2 import lives on the backup page now. */
export function load() {
  redirect(301, '/backup');
}
