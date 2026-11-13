import type { SourceKind } from '../types';
import { ActivityWindow, TrackerCore } from './core';

/** A larger forward step is a jump in the book, not reading. */
const MAX_READ_STEP = 4_000;

const COUNTER_CONTAINERS = [
  '#ttu-page-footer',
  '[title*="Progress" i]',
  '[class*="footer" i]',
  '[class*="progress" i]',
  '[class*="counter" i]',
  'footer',
];

const COUNTER_REGEX = /([\d][\d,.\s]*)\s*\/\s*([\d][\d,.\s]*)/;

function parseNumber(value: string): number {
  return Number(value.replace(/[^\d]/g, ''));
}

/**
 * Read the "explored / total" characters counter of Ttsu-like readers.
 * The chapter counter shows the same pattern, so use the largest total.
 */
export function readCharacterCounter(root: ParentNode = document): { position: number; total: number } | null {
  let best: { position: number; total: number } | null = null;
  const seen = new Set<Element>();
  for (const selector of COUNTER_CONTAINERS) {
    for (const container of root.querySelectorAll(selector)) {
      if (seen.has(container) || container.closest('.book-content')) continue;
      seen.add(container);
      const candidates = [container, ...container.querySelectorAll('span, div, p, button')];
      for (const element of candidates) {
        const text = (element as HTMLElement).innerText ?? element.textContent ?? '';
        if (text.length > 80) continue;
        const match = text.match(COUNTER_REGEX);
        if (!match) continue;
        const position = parseNumber(match[1] ?? '');
        const total = parseNumber(match[2] ?? '');
        if (!Number.isFinite(total) || total <= 0 || position > total) continue;
        if (!best || total > best.total) best = { position, total };
      }
    }
  }
  return best;
}

function cleanBookTitle(title: string): string {
  return (
    title
      .split(/\s+[|｜\-–]\s+/)
      .filter((part) => !/ttsu|ッツ|yatsu|ebook reader/i.test(part))
      .join(' - ')
      .trim() || title.trim()
  );
}

function isBookPage(source: SourceKind): boolean {
  if (source === 'ttsu') return location.pathname.startsWith('/b');
  // The Yatsu routes are not verified. A visible counter marks a book page.
  return true;
}

export function startReaderTracker(source: Extract<SourceKind, 'ttsu' | 'yatsu'>) {
  const core = new TrackerCore(source, { wallClock: true });
  const activity = new ActivityWindow(core);
  let bookKey: string | null = null;
  let startPosition = 0;
  let maxPosition = 0;
  let lastPosition: number | null = null;
  let jumpedChars = 0;
  let missingCounterChecks = 0;

  const resetBook = (key: string | null, title: string, position: number) => {
    bookKey = key;
    startPosition = position;
    maxPosition = position;
    lastPosition = position;
    jumpedChars = 0;
    core.setIdentity(
      key ? { key, title, url: location.href, meta: { readerPosition: position } } : null,
    );
  };

  const check = () => {
    if (!isBookPage(source)) {
      if (bookKey) resetBook(null, '', 0);
      return;
    }
    const title = cleanBookTitle(document.title);
    const counter = readCharacterCounter();
    if (!counter) {
      missingCounterChecks += 1;
      if (bookKey && missingCounterChecks > 5) core.setWarning('counter-hidden');
      return;
    }
    missingCounterChecks = 0;
    core.setWarning(undefined);
    const key = `${title}::${counter.total}`;
    if (key !== bookKey) {
      resetBook(key, title, counter.position);
      return;
    }
    if (lastPosition !== null && counter.position !== lastPosition) {
      const step = counter.position - lastPosition;
      if (step > MAX_READ_STEP) jumpedChars += step;
      activity.signal();
    }
    lastPosition = counter.position;
    if (counter.position - jumpedChars > maxPosition) maxPosition = counter.position - jumpedChars;
    core.setChars(maxPosition - startPosition);
    core.setIdentity({
      key,
      title,
      url: location.href,
      meta: { readerPosition: counter.position, readerTotal: counter.total },
    });
  };

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      check();
    }, 400);
  };

  new MutationObserver(schedule).observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
  });
  setInterval(check, 3_000);
  activity.start();
  core.start();
  check();
}
