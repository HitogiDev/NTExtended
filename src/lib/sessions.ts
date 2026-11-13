import { localDateKey } from './api';
import type { Draft, LogType, Session, Settings, SourceKind, TrackerReport } from './types';

export type InstanceCursors = Record<string, { seconds: number; chars: number; at: number }>;

export function sessionTotals(instances: Session['instances']) {
  let seconds = 0;
  let chars = 0;
  for (const instance of Object.values(instances)) {
    seconds += Math.max(0, instance.seconds - instance.startSeconds);
    chars += Math.max(0, instance.chars - instance.startChars);
  }
  return { seconds, chars };
}

/**
 * Apply a report to the session of its content.
 * Return null when the report has no activity yet, so idle pages create no session.
 */
export function applyReport(
  existing: Session | undefined,
  report: TrackerReport,
  tabId: number,
  cursors: InstanceCursors,
  now = Date.now(),
): Session | null {
  const seconds = report.activeSeconds;
  const chars = report.chars ?? 0;
  const known = existing?.instances[report.instanceId];
  const cursor = cursors[report.instanceId];
  const instance = known ?? {
    startSeconds: cursor?.seconds ?? 0,
    startChars: cursor?.chars ?? 0,
    seconds,
    chars,
  };
  const grew = seconds > instance.seconds || chars > instance.chars;
  const nextInstance = { ...instance, seconds, chars };
  const contribution = seconds - nextInstance.startSeconds + (chars - nextInstance.startChars);

  if (!existing && !report.active && contribution <= 0) return null;

  const base: Session = existing ?? {
    id: crypto.randomUUID(),
    tabId,
    source: report.source,
    key: report.key,
    title: report.title,
    url: report.url,
    startedAt: now,
    updatedAt: now,
    lastActiveAt: now,
    active: false,
    manualPause: false,
    instances: {},
    activeSeconds: 0,
    chars: 0,
    meta: {},
  };
  const instances = { ...base.instances, [report.instanceId]: nextInstance };
  const totals = sessionTotals(instances);
  return {
    ...base,
    title: report.title || base.title,
    url: report.url || base.url,
    updatedAt: now,
    lastActiveAt: report.active || grew ? now : base.lastActiveAt,
    active: report.active,
    manualPause: Boolean(report.manualPause),
    warning: report.warning,
    meta: { ...base.meta, ...stripUndefined(report.meta ?? {}) },
    instances,
    activeSeconds: totals.seconds,
    chars: totals.chars,
  };
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

/** Remember the instance counters so a later session starts after them. */
export function cursorsAfter(session: Session, cursors: InstanceCursors, now = Date.now()): InstanceCursors {
  const next = { ...cursors };
  for (const [id, instance] of Object.entries(session.instances)) {
    next[id] = { seconds: instance.seconds, chars: instance.chars, at: now };
  }
  return next;
}

const SITE_TYPES: Array<[RegExp, LogType]> = [
  [/crunchyroll|hidive|animelon|bilibili\.tv|anime/i, 'anime'],
  [/netflix|primevideo|disneyplus|hulu|tver|abema|unext|max\.com/i, 'tv show'],
];

export function defaultType(source: SourceKind, site?: string): LogType {
  if (source === 'youtube') return 'video';
  if (source === 'ttsu' || source === 'yatsu') return 'light-novel';
  if (source === 'article') return 'reading';
  for (const [pattern, type] of SITE_TYPES) {
    if (site && pattern.test(site)) return type;
  }
  return 'video';
}

/** Return null for sessions below the minimum length. */
export function draftFromSession(session: Session, settings: Settings, now = Date.now()): Draft | null {
  const minutes = session.activeSeconds / 60;
  if (minutes < settings.minSessionMinutes && session.chars === 0) return null;
  if (session.activeSeconds < 30 && session.chars === 0) return null;
  const type = defaultType(session.source, session.meta.site);
  const endedAt = Math.min(now, session.lastActiveAt || now);
  const isVideo = session.source === 'youtube';
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    endedAt,
    source: session.source,
    type,
    mediaTitle: isVideo ? session.meta.channelName || session.title : session.title,
    description: isVideo ? session.title : session.source === 'article' ? session.url : '',
    time: Math.max(1, Math.round(minutes)),
    chars: session.chars,
    episodes: type === 'anime' ? 1 : 0,
    date: localDateKey(endedAt),
    url: session.url,
    private: settings.privateByDefault,
    status: 'pending',
    attempts: 0,
    meta: session.meta,
  };
}

export function mergeDrafts(drafts: [Draft, ...Draft[]]): Draft {
  const [first, ...rest] = [...drafts].sort((a, b) => a.endedAt - b.endedAt) as [Draft, ...Draft[]];
  const descriptions = [first.description, ...rest.map((draft) => draft.description)]
    .map((text) => text.trim())
    .filter((text, index, list) => text && list.indexOf(text) === index);
  return {
    ...first,
    id: crypto.randomUUID(),
    endedAt: Math.max(...drafts.map((draft) => draft.endedAt)),
    time: drafts.reduce((sum, draft) => sum + draft.time, 0),
    chars: drafts.reduce((sum, draft) => sum + draft.chars, 0),
    episodes: drafts.reduce((sum, draft) => sum + draft.episodes, 0),
    description: descriptions.join('\n'),
    status: 'pending',
    error: undefined,
    attempts: 0,
  };
}
