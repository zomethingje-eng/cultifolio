/** Appearance: follow the system, or light or dark by choice. Kept on this device; app.html applies it before first paint. */
import { browser } from '$app/environment';
export type Theme = 'system' | 'light' | 'dark';
const KEY = 'cultifolio.theme';
class ThemeStore {
  current = $state<Theme>('system');
  load() {
    if (!browser) return;
    try {
      const v = localStorage.getItem(KEY);
      this.current = v === 'light' || v === 'dark' ? v : 'system';
    } catch {
      this.current = 'system';
    }
  }
  set(t: Theme) {
    this.current = t;
    if (!browser) return;
    try {
      if (t === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, t);
    } catch {
      /* fine */
    }
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  }
}
export const theme = new ThemeStore();
