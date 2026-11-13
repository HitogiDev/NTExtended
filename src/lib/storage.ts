import { browser } from 'wxt/browser';
import { DEFAULT_SETTINGS, type Draft, type Session, type Settings } from './types';

export interface StoreShape {
  settings: Settings;
  sessions: Session[];
  drafts: Draft[];
  pendingConnect: { tabId: number; createdAt: number } | null;
  /** Counter values of tracker instances that a finished session already used. */
  instanceCursors: Record<string, { seconds: number; chars: number; at: number }>;
}

const DEFAULTS: StoreShape = {
  settings: DEFAULT_SETTINGS,
  sessions: [],
  drafts: [],
  pendingConnect: null,
  instanceCursors: {},
};

export async function readStore<K extends keyof StoreShape>(key: K): Promise<StoreShape[K]> {
  const result = await browser.storage.local.get(key);
  const value = result[key] as StoreShape[K] | undefined;
  if (key === 'settings') {
    return { ...DEFAULT_SETTINGS, ...(value as Settings | undefined) } as StoreShape[K];
  }
  return value ?? DEFAULTS[key];
}

export async function writeStore<K extends keyof StoreShape>(key: K, value: StoreShape[K]) {
  await browser.storage.local.set({ [key]: value });
}

let queue: Promise<unknown> = Promise.resolve();

/** Run read-modify-write updates one at a time inside the background context. */
export function updateStore<K extends keyof StoreShape>(
  key: K,
  update: (value: StoreShape[K]) => StoreShape[K],
): Promise<StoreShape[K]> {
  const run = queue.then(async () => {
    const next = update(await readStore(key));
    await writeStore(key, next);
    return next;
  });
  queue = run.catch(() => undefined);
  return run;
}

export function watchStore<K extends keyof StoreShape>(
  key: K,
  listener: (value: StoreShape[K]) => void,
): () => void {
  const handler = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area !== 'local' || !(key in changes)) return;
    void readStore(key).then(listener);
  };
  browser.storage.onChanged.addListener(handler);
  return () => browser.storage.onChanged.removeListener(handler);
}
