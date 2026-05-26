import { useEffect } from 'react';
import { useSettings } from './useSettings';

/**
 * Render-nothing component that syncs the `appearance.theme` setting to
 * the `dark` CSS class on `document.documentElement`.
 *
 * - `'dark'`  → always adds `.dark`
 * - `'light'` → always removes `.dark`
 * - `'auto'`  → follows `prefers-color-scheme`, with a live listener
 *
 * Until settings load, falls back to the system preference.
 */
export function ThemeWatcher(): null {
  const { settings } = useSettings();
  const theme = settings?.['appearance.theme'] ?? 'auto';

  useEffect(() => {
    const root = document.documentElement;

    if (theme === 'dark') {
      root.classList.add('dark');
      return;
    }

    if (theme === 'light') {
      root.classList.remove('dark');
      return;
    }

    // 'auto' — follow system preference
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    const applySystem = (matches: boolean): void => {
      if (matches) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applySystem(mq.matches);

    const handler = (e: MediaQueryListEvent): void => applySystem(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  return null;
}
