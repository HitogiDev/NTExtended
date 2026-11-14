export const LOG_TYPES = [
  'video',
  'anime',
  'tv show',
  'movie',
  'reading',
  'light-novel',
  'vn',
  'manga',
  'audio',
  'other',
] as const;
export type LogType = (typeof LOG_TYPES)[number];

export type SourceKind = 'youtube' | 'ttsu' | 'yatsu' | 'video' | 'article';

export interface SessionMeta {
  videoId?: string;
  channelName?: string;
  thumbnail?: string;
  site?: string;
  readerTotal?: number;
  readerPosition?: number;
}

/** A tracker report. Counters are cumulative for one content script instance. */
export interface TrackerReport {
  source: SourceKind;
  /** Identity of the content inside the tab, for example a video ID. */
  key: string;
  /** A new value after each page load, so the background can keep earlier totals. */
  instanceId: string;
  title: string;
  url: string;
  active: boolean;
  activeSeconds: number;
  chars?: number;
  /** True when the user paused the tracker manually. */
  manualPause?: boolean;
  warning?: 'counter-hidden';
  /** The tracker verdict: true for Japanese content. Undefined while it is unknown. */
  japanese?: boolean;
  meta?: SessionMeta;
}

export interface Session {
  id: string;
  tabId: number;
  source: SourceKind;
  key: string;
  title: string;
  url: string;
  startedAt: number;
  updatedAt: number;
  /** Last time the tracker reported activity. */
  lastActiveAt: number;
  active: boolean;
  manualPause: boolean;
  /**
   * Counters per tracker instance. A page reload or a second frame adds an instance.
   * The session total is the sum of (current - start) for each instance.
   */
  instances: Record<string, { startSeconds: number; startChars: number; seconds: number; chars: number }>;
  activeSeconds: number;
  chars: number;
  warning?: TrackerReport['warning'];
  meta: SessionMeta;
}

export type DraftStatus = 'pending' | 'sending' | 'error' | 'sent';

export interface MediaChoice {
  contentId: string;
  title: string;
  image?: string;
  type: LogType;
}

export interface Draft {
  id: string;
  createdAt: number;
  /** End of the tracked activity. The log uses it when the date is unchanged. */
  endedAt: number;
  source: SourceKind;
  type: LogType;
  mediaTitle: string;
  media?: MediaChoice;
  description: string;
  /** Minutes. */
  time: number;
  chars: number;
  episodes: number;
  /** Local date, YYYY-MM-DD. */
  date: string;
  url: string;
  private: boolean;
  status: DraftStatus;
  error?: string;
  attempts: number;
  retryable?: boolean;
  nextAttemptAt?: number;
  xp?: number;
  logId?: string;
  meta: SessionMeta;
}

export interface Settings {
  serverUrl: string;
  apiKey: string;
  theme: string;
  language: 'auto' | 'en' | 'es';
  minSessionMinutes: number;
  idleMinutes: number;
  autoFinishMinutes: number;
  trackYouTube: boolean;
  trackReaders: boolean;
  videoSites: string[];
  privateByDefault: boolean;
  /** Track only content that looks Japanese. */
  onlyJapanese: boolean;
  /** Sites where all content counts as Japanese, as host names. */
  trustedSites: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  serverUrl: 'https://nihongotracker.app',
  apiKey: '',
  theme: 'system',
  language: 'auto',
  minSessionMinutes: 1,
  idleMinutes: 5,
  autoFinishMinutes: 30,
  trackYouTube: true,
  trackReaders: true,
  videoSites: [],
  privateByDefault: false,
  onlyJapanese: true,
  trustedSites: [],
};

export interface NtUser {
  _id: string;
  username: string;
  avatar?: string;
  stats: {
    userLevel: number;
    userXp: number;
    userXpToNextLevel: number;
    userXpToCurrentLevel: number;
    currentStreak: number;
    longestStreak?: number;
  };
  settings?: { language?: string };
}

export interface DailyGoal {
  _id?: string;
  type: 'time' | 'chars' | 'episodes' | 'pages';
  mediaType?: string | null;
  cadence?: 'daily' | 'weekly';
  target: number;
  isActive: boolean;
}

export interface DailyGoalsResponse {
  goals: DailyGoal[];
  goalProgress: Record<string, number>;
}
