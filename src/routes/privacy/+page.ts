import { redirect } from '@sveltejs/kit';
/** /privacy is what people type; the privacy section lives on the how-it-works page (round twenty-eight, 14). */
export function load() {
  redirect(301, '/about/how#privacy');
}
