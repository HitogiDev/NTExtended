import { browser, type Browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { ApiError, createLog, getMe, lookupYouTubeVideo, normalizeServerUrl } from '@/lib/api';
import type { BackgroundMessage, MessageResult, TabMessage } from '@/lib/messages';
import {
  applyReport,
  cursorsAfter,
  draftFromSession,
  mergeDrafts,
  type InstanceCursors,
} from '@/lib/sessions';
import { looksJapanese } from '@/lib/japanese';
import { readStore, updateStore, writeStore } from '@/lib/storage';
import type { Draft, Session, TrackerReport } from '@/lib/types';

const TICK_ALARM = 'ntx-tick';
const STALE_REPORT_MS = 2 * 60_000;
const CONNECT_WINDOW_MS = 15 * 60_000;
const CURSOR_TTL_MS = 2 * 24 * 60 * 60_000;
const SENT_TTL_MS = 3 * 24 * 60 * 60_000;
const VIDEO_SCRIPT_ID = 'ntx-video';
const SKIPPED_TTL_MS = 30 * 60_000;
const ARTICLE_MIN_KANA = 30;

function hostOf(url: string | undefined) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
}

function overrideKey(tabId: number, key: string) {
  return `${tabId}::${key}`;
}

/**
 * Apply the language rule. Content counts when the tracker says it is Japanese,
 * the tab title has kana for streaming video, the site is trusted, or the user allowed it.
 */
async function languageAllowed(report: TrackerReport, tabId: number, tabTitle: string | undefined, host: string) {
  const settings = await readStore('settings');
  if (!settings.onlyJapanese || report.japanese === true) return true;
  if (report.source === 'video' && tabTitle && looksJapanese(tabTitle)) return true;
  if (host && settings.trustedSites.includes(host)) return true;
  const overrides = await readStore('languageOverrides');
  return overrides.includes(overrideKey(tabId, report.key));
}

function stripUrl(url: string | undefined) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

async function sendToTab(tabId: number, message: TabMessage) {
  try {
    return await browser.tabs.sendMessage(tabId, message);
  } catch {
    return undefined;
  }
}

// ── Sessions ────────────────────────────────────────────────────────────────

async function finishSessions(match: (session: Session) => boolean, keepDraft = true) {
  const settings = await readStore('settings');
  const finished: Session[] = [];
  await updateStore('sessions', (sessions) =>
    sessions.filter((session) => {
      if (!match(session)) return true;
      finished.push(session);
      return false;
    }),
  );
  if (finished.length === 0) return;

  await updateStore('instanceCursors', (cursors) =>
    finished.reduce<InstanceCursors>((next, session) => cursorsAfter(session, next), cursors),
  );
  if (!keepDraft) return;

  const drafts = finished
    .map((session) => draftFromSession(session, settings))
    .filter((draft): draft is Draft => draft !== null);
  if (drafts.length === 0) return;
  await updateStore('drafts', (current) => [...drafts, ...current]);
  for (const draft of drafts) {
    if (draft.source === 'youtube') void enrichYouTubeDraft(draft);
  }
}

async function enrichYouTubeDraft(draft: Draft) {
  try {
    const { channel, video } = await lookupYouTubeVideo(draft.url);
    await patchDraft(draft.id, (current) => ({
      ...current,
      media: current.media ?? {
        contentId: channel.contentId,
        title: channel.title.contentTitleNative,
        image: channel.contentImage,
        type: 'video',
      },
      mediaTitle: channel.title.contentTitleNative || current.mediaTitle,
      description: current.description || video.title.contentTitleNative,
      meta: { ...current.meta, thumbnail: video.contentImage },
    }));
  } catch {
    // The draft stays editable. The server also resolves the channel from the media ID.
  }
}

async function handleReport(report: TrackerReport, sender: Browser.runtime.MessageSender) {
  const tab = sender.tab;
  if (tab?.id === undefined || tab.incognito) return;
  const tabId = tab.id;
  const normalized: TrackerReport =
    report.source === 'video'
      ? {
          ...report,
          key: stripUrl(tab.url) || report.key,
          title: tab.title || report.title,
          url: tab.url || report.url,
          meta: { ...report.meta, site: tab.url ? new URL(tab.url).hostname : report.meta?.site },
        }
      : report;

  // A new content in the same tab and source finishes the earlier session.
  await finishSessions(
    (session) =>
      session.tabId === tabId &&
      session.source === normalized.source &&
      session.key !== normalized.key,
  );

  const host = hostOf(tab.url);
  const hasSession = (await readStore('sessions')).some(
    (session) => session.tabId === tabId && session.source === normalized.source && session.key === normalized.key,
  );
  const allowed = await languageAllowed(normalized, tabId, tab.title, host);
  if (!allowed && hasSession && normalized.japanese === false) {
    // The verdict can arrive after the session started, or the session can predate the rule.
    await finishSessions(
      (session) =>
        session.tabId === tabId && session.source === normalized.source && session.key === normalized.key,
      false,
    );
  }
  if (!allowed && (!hasSession || normalized.japanese === false)) {
    // Remember the content while it plays, so the popup can offer to track it anyway.
    if (normalized.active || normalized.activeSeconds > 0) {
      await updateStore('skipped', (skipped) => [
        { tabId, source: normalized.source, key: normalized.key, title: normalized.title, host, at: Date.now() },
        ...skipped.filter((item) => item.tabId !== tabId),
      ]);
    }
    return;
  }
  if ((await readStore('skipped')).some((item) => item.tabId === tabId)) {
    await updateStore('skipped', (skipped) => skipped.filter((item) => item.tabId !== tabId));
  }

  // Counters are cumulative, so time measured before the verdict still counts.
  const cursors = await readStore('instanceCursors');
  await updateStore('sessions', (sessions) => {
    const index = sessions.findIndex(
      (session) =>
        session.tabId === tabId &&
        session.source === normalized.source &&
        session.key === normalized.key,
    );
    const next = applyReport(index >= 0 ? sessions[index] : undefined, normalized, tabId, cursors);
    if (!next) return sessions;
    if (index >= 0) return sessions.map((session, i) => (i === index ? next : session));
    return [...sessions, next];
  });
}

async function tick() {
  const now = Date.now();
  const settings = await readStore('settings');
  const sessions = await readStore('sessions');
  const finishIds = new Set<string>();

  for (const session of sessions) {
    if (!session.active && now - session.lastActiveAt > settings.autoFinishMinutes * 60_000) {
      finishIds.add(session.id);
      continue;
    }
    if (now - session.updatedAt < STALE_REPORT_MS) continue;
    const answer = (await sendToTab(session.tabId, { type: 'tracker-ping' })) as
      | { ok?: boolean }
      | undefined;
    if (!answer?.ok) finishIds.add(session.id);
  }
  if (finishIds.size > 0) await finishSessions((session) => finishIds.has(session.id));

  await updateStore('instanceCursors', (cursors) =>
    Object.fromEntries(Object.entries(cursors).filter(([, cursor]) => now - cursor.at < CURSOR_TTL_MS)),
  );
  await updateStore('skipped', (skipped) => skipped.filter((item) => now - item.at < SKIPPED_TTL_MS));
  await updateStore('drafts', (drafts) =>
    drafts.filter((draft) => draft.status !== 'sent' || now - draft.createdAt < SENT_TTL_MS),
  );

  const drafts = await readStore('drafts');
  for (const draft of drafts) {
    if (draft.status === 'error' && draft.retryable && (draft.nextAttemptAt ?? 0) <= now) {
      void sendDraft(draft.id);
    }
  }
}

// ── Drafts ──────────────────────────────────────────────────────────────────

async function patchDraft(id: string, update: (draft: Draft) => Draft) {
  await updateStore('drafts', (drafts) =>
    drafts.map((draft) => (draft.id === id ? update(draft) : draft)),
  );
}

async function sendDraft(id: string): Promise<MessageResult<Draft>> {
  const draft = (await readStore('drafts')).find((item) => item.id === id);
  if (!draft) return { ok: false, error: 'not-found' };
  if (draft.status === 'sent' || draft.status === 'sending') return { ok: true, data: draft };

  await patchDraft(id, (current) => ({ ...current, status: 'sending', error: undefined }));
  try {
    const log = await createLog(draft);
    await patchDraft(id, (current) => ({
      ...current,
      status: 'sent',
      xp: log.xp,
      logId: log._id,
      retryable: false,
      createdAt: Date.now(),
    }));
    return { ok: true };
  } catch (error) {
    const apiError = error instanceof ApiError ? error : new ApiError(String(error), 0);
    const attempts = draft.attempts + 1;
    await patchDraft(id, (current) => ({
      ...current,
      status: 'error',
      error: apiError.message,
      attempts,
      retryable: apiError.retryable,
      nextAttemptAt: Date.now() + Math.min(60, 2 ** attempts) * 60_000,
    }));
    return { ok: false, error: apiError.message };
  }
}

// ── Article timer ───────────────────────────────────────────────────────────

async function startArticle(
  tabId: number,
  mode: 'page' | 'selection' | 'time',
  force: boolean,
): Promise<MessageResult> {
  const [probe] = await browser.scripting.executeScript({
    target: { tabId },
    func: () => {
      // Keep this rule aligned with countKana in lib/japanese.ts.
      const text = document.body?.innerText.slice(0, 200_000) ?? '';
      const kana = (text.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length;
      return {
        started: Boolean((window as { __ntxArticleStarted?: boolean }).__ntxArticleStarted),
        kana,
        key: location.href.split('#')[0] ?? location.href,
        host: location.hostname.replace(/^www\./, ''),
      };
    },
  });
  const result = probe?.result as { started: boolean; kana: number; key: string; host: string } | undefined;
  if (!result) return { ok: false, error: 'tab' };
  if (result.started) {
    await sendToTab(tabId, { type: 'tracker-control', action: 'resume' });
    return { ok: true };
  }
  const settings = await readStore('settings');
  const trusted = settings.trustedSites.includes(result.host);
  if (settings.onlyJapanese && !trusted && result.kana < ARTICLE_MIN_KANA) {
    if (!force) return { ok: false, error: 'not-japanese' };
    await updateStore('languageOverrides', (overrides) => [
      ...new Set([...overrides, overrideKey(tabId, result.key)]),
    ]);
  }
  await browser.scripting.executeScript({
    target: { tabId },
    func: (value: string) => {
      (window as { __ntxArticleMode?: string }).__ntxArticleMode = value;
    },
    args: [mode],
  });
  await browser.scripting.executeScript({ target: { tabId }, files: ['/article.js'] });
  return { ok: true };
}

// ── Streaming sites ─────────────────────────────────────────────────────────

async function syncVideoSites() {
  const settings = await readStore('settings');
  const granted = [];
  for (const origin of settings.videoSites) {
    if (await browser.permissions.contains({ origins: [origin] })) granted.push(origin);
  }
  try {
    await browser.scripting.unregisterContentScripts({ ids: [VIDEO_SCRIPT_ID] });
  } catch {
    // No script was registered.
  }
  if (granted.length === 0) return;
  await browser.scripting.registerContentScripts([
    {
      id: VIDEO_SCRIPT_ID,
      matches: granted,
      js: ['video.js'],
      allFrames: true,
      runAt: 'document_idle',
      persistAcrossSessions: true,
    },
  ]);
}

// ── Connection ──────────────────────────────────────────────────────────────

function serverOrigin(serverUrl: string) {
  return new URL(normalizeServerUrl(serverUrl)).origin;
}

async function startConnect(): Promise<MessageResult> {
  const settings = await readStore('settings');
  const tab = await browser.tabs.create({
    url: `${normalizeServerUrl(settings.serverUrl)}/extension/connect`,
  });
  if (tab.id === undefined) return { ok: false, error: 'tab' };
  await writeStore('pendingConnect', { tabId: tab.id, createdAt: Date.now() });
  return { ok: true };
}

async function injectConnectBridge(tabId: number, url: string | undefined) {
  const pending = await readStore('pendingConnect');
  if (!pending || pending.tabId !== tabId || !url) return;
  const settings = await readStore('settings');
  const parsed = new URL(url);
  if (parsed.origin !== serverOrigin(settings.serverUrl)) return;
  if (!parsed.pathname.startsWith('/extension/connect')) return;
  try {
    await browser.scripting.executeScript({ target: { tabId }, files: ['/connect.js'] });
  } catch {
    // The page can still show the key so the user can paste it.
  }
}

async function acceptApiKey(key: string): Promise<MessageResult> {
  const trimmed = key.trim();
  if (!/^ntk_[a-f0-9]{16,}$/i.test(trimmed)) return { ok: false, error: 'invalid-key' };
  try {
    const user = await getMe(trimmed);
    await updateStore('settings', (settings) => ({ ...settings, apiKey: trimmed }));
    return { ok: true, data: { username: user.username } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function acceptConnectKey(
  key: string,
  sender: Browser.runtime.MessageSender,
): Promise<MessageResult> {
  const pending = await readStore('pendingConnect');
  const settings = await readStore('settings');
  if (!pending || Date.now() - pending.createdAt > CONNECT_WINDOW_MS) {
    return { ok: false, error: 'no-pending-connect' };
  }
  if (sender.tab?.id !== pending.tabId || !sender.url) return { ok: false, error: 'wrong-tab' };
  if (new URL(sender.url).origin !== serverOrigin(settings.serverUrl)) {
    return { ok: false, error: 'wrong-origin' };
  }
  const result = await acceptApiKey(key);
  if (result.ok) await writeStore('pendingConnect', null);
  return result;
}

// ── Badge ───────────────────────────────────────────────────────────────────

async function updateBadge() {
  const [drafts, sessions, settings] = await Promise.all([
    readStore('drafts'),
    readStore('sessions'),
    readStore('settings'),
  ]);
  const pending = drafts.filter((draft) => draft.status !== 'sent').length;
  const active = sessions.some((session) => session.active);
  const action = browser.action ?? (browser as unknown as { browserAction: typeof browser.action }).browserAction;
  await action.setBadgeText({ text: pending > 0 ? String(pending) : active ? '●' : '' });
  await action.setBadgeBackgroundColor({ color: pending > 0 ? '#7c3aed' : '#16a34a' });
  const suffix = settings.apiKey ? '' : '-off';
  await action.setIcon({
    path: {
      16: `/icon/16${suffix}.png`,
      32: `/icon/32${suffix}.png`,
      48: `/icon/48${suffix}.png`,
    },
  });
}

// ── Router ──────────────────────────────────────────────────────────────────

async function route(
  message: BackgroundMessage,
  sender: Browser.runtime.MessageSender,
): Promise<MessageResult> {
  switch (message.type) {
    case 'report':
      await handleReport(message.report, sender);
      return { ok: true };
    case 'tracker-closed': {
      const tabId = sender.tab?.id;
      if (tabId === undefined) return { ok: false };
      const key = message.key;
      await finishSessions(
        (session) => session.tabId === tabId && session.key === key && session.source !== 'video',
        message.finish,
      );
      return { ok: true };
    }
    case 'control': {
      const session = (await readStore('sessions')).find((item) => item.id === message.sessionId);
      if (!session) return { ok: false, error: 'not-found' };
      if (message.action === 'pause' || message.action === 'resume') {
        await sendToTab(session.tabId, { type: 'tracker-control', action: message.action });
        return { ok: true };
      }
      if (session.source === 'article') {
        // Stop the timer so the page does not start a new session.
        await sendToTab(session.tabId, { type: 'tracker-control', action: 'pause' });
      }
      await finishSessions((item) => item.id === session.id, message.action === 'finish');
      return { ok: true };
    }
    case 'start-article':
      return startArticle(message.tabId, message.mode, Boolean(message.force));
    case 'allow-content': {
      const { tabId, key, trustHost } = message;
      if (trustHost) {
        await updateStore('settings', (settings) => ({
          ...settings,
          trustedSites: [...new Set([...settings.trustedSites, trustHost])],
        }));
      } else {
        await updateStore('languageOverrides', (overrides) => [...new Set([...overrides, overrideKey(tabId, key)])]);
      }
      await updateStore('skipped', (skipped) => skipped.filter((item) => item.tabId !== tabId));
      return { ok: true };
    }
    case 'dismiss-skipped':
      await updateStore('skipped', (skipped) =>
        skipped.filter((item) => item.tabId !== message.tabId || item.key !== message.key),
      );
      return { ok: true };
    case 'update-draft':
      await patchDraft(message.draft.id, () => ({
        ...message.draft,
        status: message.draft.status === 'sent' ? 'sent' : 'pending',
        error: undefined,
      }));
      return { ok: true };
    case 'delete-draft':
      await updateStore('drafts', (drafts) => drafts.filter((draft) => draft.id !== message.id));
      return { ok: true };
    case 'send-draft':
      return sendDraft(message.id);
    case 'send-drafts': {
      // Send one at a time so XP, streaks and achievements are calculated in order.
      const errors: string[] = [];
      for (const id of message.ids) {
        const result = await sendDraft(id);
        if (!result.ok && result.error) errors.push(result.error);
      }
      return errors.length > 0 ? { ok: false, error: errors[0] } : { ok: true };
    }
    case 'delete-drafts':
      await updateStore('drafts', (drafts) =>
        drafts.filter((draft) => !message.ids.includes(draft.id) || draft.status === 'sending'),
      );
      return { ok: true };
    case 'merge-drafts': {
      const drafts = await readStore('drafts');
      const selected = drafts.filter(
        (draft) => message.ids.includes(draft.id) && draft.status !== 'sent',
      );
      const [first, ...rest] = selected;
      if (!first || rest.length === 0) return { ok: false, error: 'select-two' };
      const merged = mergeDrafts([first, ...rest]);
      await updateStore('drafts', (current) => [
        merged,
        ...current.filter((draft) => !message.ids.includes(draft.id)),
      ]);
      return { ok: true };
    }
    case 'connect-start':
      return startConnect();
    case 'connect-key':
      return acceptConnectKey(message.key, sender);
    case 'set-api-key':
      return acceptApiKey(message.key);
    case 'disconnect':
      await updateStore('settings', (settings) => ({ ...settings, apiKey: '' }));
      return { ok: true };
    case 'sync-video-sites':
      await syncVideoSites();
      return { ok: true };
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    if (sender.id !== browser.runtime.id) return undefined;
    return route(message as BackgroundMessage, sender).catch((error: unknown) => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    void finishSessions((session) => session.tabId === tabId);
    void updateStore('skipped', (skipped) => skipped.filter((item) => item.tabId !== tabId));
    void updateStore('languageOverrides', (overrides) =>
      overrides.filter((entry) => !entry.startsWith(`${tabId}::`)),
    );
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
      const key = stripUrl(changeInfo.url);
      void finishSessions(
        (session) =>
          session.tabId === tabId &&
          (session.source === 'article' || session.source === 'video') &&
          stripUrl(session.key) !== key,
      );
    }
    if (changeInfo.status === 'complete') void injectConnectBridge(tabId, tab.url);
  });

  browser.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === TICK_ALARM) void tick();
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if ('drafts' in changes || 'sessions' in changes || 'settings' in changes) void updateBadge();
  });

  browser.runtime.onInstalled.addListener(() => {
    void syncVideoSites();
    void updateBadge();
  });
  browser.runtime.onStartup?.addListener(() => {
    void updateBadge();
  });
  void updateBadge();
});
