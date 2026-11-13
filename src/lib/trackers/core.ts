import { browser } from 'wxt/browser';
import type { TabMessage } from '../messages';
import { readStore } from '../storage';
import type { SessionMeta, SourceKind, TrackerReport } from '../types';

const HEARTBEAT_MS = 15_000;
/** Time after the last sign of reading that still counts, for example for the last page. */
const READING_GRACE_MS = 60_000;

export interface TrackerIdentity {
  key: string;
  title: string;
  url: string;
  meta?: SessionMeta;
}

export function randomId() {
  return crypto.randomUUID();
}

/**
 * Keep the state of one tracker inside a page.
 * Trackers set activity and counters. The core sends reports and handles popup controls.
 */
export class TrackerCore {
  private instanceId = randomId();
  private activeSeconds = 0;
  private chars = 0;
  private autoActive = false;
  private manualPause = false;
  private identity: TrackerIdentity | null = null;
  private warning: TrackerReport['warning'];
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private lastSent = 0;
  private wallClockSince: number | null = null;
  idleMs = 5 * 60_000;

  constructor(
    private readonly source: SourceKind,
    private readonly options: { wallClock: boolean } = { wallClock: false },
  ) {
    browser.runtime.onMessage.addListener((message: unknown) => {
      const msg = message as TabMessage;
      if (msg?.type === 'tracker-ping') {
        return Promise.resolve({ ok: true, key: this.identity?.key });
      }
      if (msg?.type !== 'tracker-control') return undefined;
      if (msg.action === 'pause') this.setManualPause(true);
      if (msg.action === 'resume') this.setManualPause(false);
      return Promise.resolve({ ok: true });
    });
    void readStore('settings').then((settings) => {
      this.idleMs = Math.max(1, settings.idleMinutes) * 60_000;
    });
    window.addEventListener('pagehide', () => this.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
  }

  get effectiveActive() {
    return this.autoActive && !this.manualPause && this.identity !== null;
  }

  get currentKey() {
    return this.identity?.key;
  }

  /** Change the content. A new key starts a new instance, so the counters restart. */
  setIdentity(identity: TrackerIdentity | null) {
    if (identity && this.identity && identity.key === this.identity.key) {
      this.identity = identity;
      return;
    }
    if (this.identity) {
      this.flush();
      void browser.runtime
        .sendMessage({ type: 'tracker-closed', key: this.identity.key, finish: true })
        .catch(() => undefined);
    }
    this.instanceId = randomId();
    this.activeSeconds = 0;
    this.chars = 0;
    this.identity = identity;
    this.wallClockSince = this.options.wallClock && this.effectiveActive ? Date.now() : null;
    this.lastSent = 0;
  }

  setWarning(warning: TrackerReport['warning']) {
    if (warning === this.warning) return;
    this.warning = warning;
    this.send();
  }

  setActive(active: boolean) {
    if (active === this.autoActive) return;
    this.syncWallClock(() => {
      this.autoActive = active;
    });
    this.send();
  }

  private setManualPause(paused: boolean) {
    this.syncWallClock(() => {
      this.manualPause = paused;
    });
    this.send();
  }

  /** Credit measured seconds. Video trackers use it for real playback time. */
  addSeconds(seconds: number) {
    if (!this.effectiveActive || seconds <= 0) return;
    this.activeSeconds += seconds;
    this.sendIfDue();
  }

  /** Remove credited time. Readers use it when they become idle. */
  removeSeconds(seconds: number) {
    this.collectWallClock();
    this.activeSeconds = Math.max(0, this.activeSeconds - seconds);
  }

  setChars(chars: number) {
    const next = Math.max(0, Math.round(chars));
    if (next === this.chars) return;
    this.chars = next;
    this.sendIfDue();
  }

  private syncWallClock(change: () => void) {
    this.collectWallClock();
    change();
    this.wallClockSince = this.options.wallClock && this.effectiveActive ? Date.now() : null;
  }

  private collectWallClock() {
    if (!this.options.wallClock || this.wallClockSince === null) return;
    const now = Date.now();
    this.activeSeconds += (now - this.wallClockSince) / 1000;
    this.wallClockSince = now;
  }

  private sendIfDue() {
    if (Date.now() - this.lastSent >= HEARTBEAT_MS) this.send();
  }

  flush() {
    this.send();
  }

  send() {
    if (!this.identity) return;
    this.collectWallClock();
    this.lastSent = Date.now();
    const report: TrackerReport = {
      source: this.source,
      key: this.identity.key,
      instanceId: this.instanceId,
      title: this.identity.title,
      url: this.identity.url,
      active: this.effectiveActive,
      activeSeconds: Math.round(this.activeSeconds),
      chars: this.chars,
      manualPause: this.manualPause,
      warning: this.warning,
      meta: this.identity.meta,
    };
    void browser.runtime.sendMessage({ type: 'report', report }).catch(() => undefined);
  }

  start() {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => {
      if (this.effectiveActive) this.send();
    }, HEARTBEAT_MS);
  }
}

/**
 * Track reading from signals such as page turns or scrolling.
 * Time counts while the page is visible and the last signal is recent.
 * The core must use wall-clock mode.
 */
export class ActivityWindow {
  private lastSignal = 0;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly core: TrackerCore) {}

  signal() {
    this.lastSignal = Date.now();
    this.evaluate();
  }

  start() {
    this.timer ??= setInterval(() => this.evaluate(), 5_000);
    document.addEventListener('visibilitychange', () => this.evaluate());
  }

  private evaluate() {
    const visible = document.visibilityState === 'visible';
    const sinceSignal = Date.now() - this.lastSignal;
    const recent = this.lastSignal > 0 && sinceSignal <= this.core.idleMs;
    const wasActive = this.core.effectiveActive;
    this.core.setActive(visible && recent);
    if (wasActive && visible && !recent) {
      // The idle window counted time without reading. Keep only a short grace period.
      const idleCredit = Math.min(sinceSignal, this.core.idleMs);
      this.core.removeSeconds(Math.max(0, idleCredit - READING_GRACE_MS) / 1000);
      this.core.flush();
    }
  }
}
