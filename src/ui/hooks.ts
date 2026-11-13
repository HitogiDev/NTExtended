import { useEffect, useMemo, useState } from 'react';
import { createTranslator, resolveLanguage } from '@/lib/i18n';
import { readStore, watchStore, type StoreShape } from '@/lib/storage';
import { DEFAULT_SETTINGS } from '@/lib/types';

export function useStore<K extends keyof StoreShape>(key: K, fallback: StoreShape[K]) {
  const [value, setValue] = useState<StoreShape[K]>(fallback);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    void readStore(key).then((next) => {
      if (!alive) return;
      setValue(next);
      setLoaded(true);
    });
    const stop = watchStore(key, (next) => alive && setValue(next));
    return () => {
      alive = false;
      stop();
    };
  }, [key]);
  return [value, loaded] as const;
}

export function useSettings() {
  return useStore('settings', DEFAULT_SETTINGS);
}

export function useTranslator() {
  const [settings] = useSettings();
  return useMemo(() => createTranslator(resolveLanguage(settings.language)), [settings.language]);
}

/** Apply the selected daisyUI theme. "system" follows the color scheme of the browser. */
export function useAppliedTheme() {
  const [settings, loaded] = useSettings();
  useEffect(() => {
    if (!loaded) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const theme = settings.theme === 'system' ? (media.matches ? 'dark' : 'light') : settings.theme;
      document.documentElement.dataset.theme = theme;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings.theme, loaded]);
}

/** Re-render every second for live timers. */
export function useNow(intervalMs = 1_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(rest).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat().format(Math.round(value));
}

export const THEMES = [
  'dark',
  'light',
  'cupcake',
  'bumblebee',
  'emerald',
  'corporate',
  'synthwave',
  'retro',
  'valentine',
  'halloween',
  'garden',
  'forest',
  'dracula',
  'cmyk',
  'night',
  'winter',
  'dim',
  'sunset',
  'abyss',
];
