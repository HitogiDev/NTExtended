import { browser } from 'wxt/browser';
import type { Draft, TrackerReport } from './types';

export type ControlAction = 'pause' | 'resume' | 'finish' | 'discard';
export type ArticleMode = 'page' | 'selection' | 'time';

export type BackgroundMessage =
  | { type: 'report'; report: TrackerReport }
  | { type: 'tracker-closed'; key: string; finish: boolean }
  | { type: 'control'; sessionId: string; action: ControlAction }
  | { type: 'start-article'; tabId: number; mode: ArticleMode }
  | { type: 'update-draft'; draft: Draft }
  | { type: 'delete-draft'; id: string }
  | { type: 'send-draft'; id: string }
  | { type: 'send-drafts'; ids: string[] }
  | { type: 'delete-drafts'; ids: string[] }
  | { type: 'merge-drafts'; ids: string[] }
  | { type: 'connect-start' }
  | { type: 'connect-key'; key: string }
  | { type: 'set-api-key'; key: string }
  | { type: 'disconnect' }
  | { type: 'sync-video-sites' };

export type TabMessage =
  | { type: 'tracker-control'; action: 'pause' | 'resume' }
  | { type: 'tracker-ping' };

export interface MessageResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

export async function sendToBackground<T = unknown>(
  message: BackgroundMessage,
): Promise<MessageResult<T>> {
  try {
    return ((await browser.runtime.sendMessage(message)) as MessageResult<T>) ?? { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
