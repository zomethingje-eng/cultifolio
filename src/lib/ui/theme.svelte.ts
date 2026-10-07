/** Appearance: follow the system, or light or dark by choice. Kept on this device; app.html applies it before first paint. */
import { browser } from '$app/environment';
import { readSetting, writeSetting } from '$lib/ui/stored';
export type Theme = 'system' | 'light' | 'dark';
const KEY = 'cultifolio.theme';
class ThemeStore {
  current = $state<Theme>('system');
  load() {
    if (!browser) return;
    const v = readSetting(KEY, 'device');
    this.current = v === 'light' || v === 'dark' ? v : 'system';
  }
  set(t: Theme) {
    this.current = t;
    if (!browser) return;
    writeSetting(KEY, 'device', t === 'system' ? null : t);
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  }
}
export const theme = new ThemeStore();
