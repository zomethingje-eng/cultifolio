/**
 * The compare tray: up to three species picked from their pages, kept in this
 * browser's local storage (a convenience, never synced), shown as a bar with
 * a link to /compare?s=a,b,c. Nothing here is about the collection.
 */
import { browser } from '$app/environment';

const KEY = 'cultifolio.compare';
export const MAX = 3;
type Pick = { slug: string; name: string };

function read(): Pick[] {
  if (!browser) return [];
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => x && typeof x.slug === 'string' && typeof x.name === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

class Compare {
  picks = $state<Pick[]>([]);
  loaded = $state(false);
  load() {
    if (this.loaded) return;
    this.picks = read();
    this.loaded = true;
  }
  has(slug: string) {
    return this.picks.some((p) => p.slug === slug);
  }
  get full() {
    return this.picks.length >= MAX;
  }
  toggle(p: Pick) {
    this.picks = this.has(p.slug) ? this.picks.filter((x) => x.slug !== p.slug) : this.full ? this.picks : [...this.picks, p];
    this.save();
  }
  remove(slug: string) {
    this.picks = this.picks.filter((x) => x.slug !== slug);
    this.save();
  }
  clear() {
    this.picks = [];
    this.save();
  }
  get href() {
    return `/compare?s=${this.picks.map((p) => p.slug).join(',')}`;
  }
  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.picks));
    } catch {
      /* a private window: the tray lives for the page */
    }
  }
}
export const compare = new Compare();
