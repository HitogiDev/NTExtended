import { readStore } from './storage';
import type { DailyGoalsResponse, Draft, LogType, MediaChoice, NtUser } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }

  /** Network failures and server errors can succeed on a later attempt. */
  get retryable() {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

export function normalizeServerUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

async function request<T>(
  path: string,
  init: RequestInit & { auth?: boolean; apiKey?: string } = {},
): Promise<T> {
  const settings = await readStore('settings');
  const apiKey = init.apiKey ?? settings.apiKey;
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  if (init.auth !== false) {
    if (!apiKey) throw new ApiError('not-connected', 401);
    headers.set('x-api-key', apiKey);
  }

  let response: Response;
  try {
    response = await fetch(`${normalizeServerUrl(settings.serverUrl)}/api/${path}`, {
      ...init,
      headers,
      credentials: 'omit',
    });
  } catch {
    throw new ApiError('network', 0);
  }

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data
        ? String((data as { message: unknown }).message)
        : `HTTP ${response.status}`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export function getMe(apiKey?: string) {
  return request<NtUser>('users/me', { apiKey });
}

export function getDailyGoals(username: string) {
  return request<DailyGoalsResponse>(`goals/daily/${encodeURIComponent(username)}`);
}

export interface YouTubeLookup {
  video: { contentId: string; title: { contentTitleNative: string }; contentImage?: string };
  channel: { contentId: string; title: { contentTitleNative: string }; contentImage?: string };
}

export function lookupYouTubeVideo(url: string) {
  return request<YouTubeLookup>(`media/youtube/video?url=${encodeURIComponent(url)}`, {
    auth: false,
  });
}

interface SearchHit {
  contentId: string;
  type?: string;
  title?: {
    contentTitleNative?: string;
    contentTitleRomaji?: string;
    contentTitleEnglish?: string;
  };
  contentImage?: string;
  coverImage?: string;
}

const SEARCH_TYPES: Partial<Record<LogType, string>> = {
  anime: 'anime',
  manga: 'manga',
  'light-novel': 'light-novel',
  vn: 'vn',
  movie: 'movie',
  'tv show': 'tv show',
};

export function isSearchableType(type: LogType) {
  return type in SEARCH_TYPES;
}

export async function searchMedia(type: LogType, search: string): Promise<MediaChoice[]> {
  const apiType = SEARCH_TYPES[type];
  if (!apiType || search.trim().length < 2) return [];
  const params = new URLSearchParams({ search: search.trim(), type: apiType, perPage: '8' });
  const hits = await request<SearchHit[]>(`media/search?${params}`, { auth: false });
  return (Array.isArray(hits) ? hits : []).map((hit) => ({
    contentId: hit.contentId,
    title:
      hit.title?.contentTitleNative ||
      hit.title?.contentTitleRomaji ||
      hit.title?.contentTitleEnglish ||
      hit.contentId,
    image: hit.coverImage || hit.contentImage,
    type,
  }));
}

export function localDateKey(time: number): string {
  const date = new Date(time);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function logDate(draft: Draft): string {
  if (localDateKey(draft.endedAt) === draft.date) return new Date(draft.endedAt).toISOString();
  return new Date(`${draft.date}T12:00:00`).toISOString();
}

interface CreatedLog {
  _id: string;
  xp?: number;
}

export function createLog(draft: Draft) {
  const body: Record<string, unknown> = {
    type: draft.type,
    mediaTitle: draft.media?.title || draft.mediaTitle,
    description: draft.description,
    date: logDate(draft),
    private: draft.private,
  };
  if (draft.media?.contentId) body.mediaId = draft.media.contentId;
  if (draft.time > 0) body.time = draft.time;
  if (draft.chars > 0) body.chars = draft.chars;
  if (draft.episodes > 0) body.episodes = draft.episodes;

  return request<CreatedLog>('logs', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Idempotency-Key': `ntx:${draft.id}` },
  });
}
