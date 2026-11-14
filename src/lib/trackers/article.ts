import type { ArticleMode } from '../messages';
import { countJapaneseCharacters, countKana, PAGE_MIN_KANA } from '../japanese';
import { ActivityWindow, TrackerCore } from './core';

const MAIN_SELECTORS = [
  '#mw-content-text',
  'article',
  'main',
  '[role="main"]',
  '.article-body',
  '.entry-content',
  '.post-content',
];

const BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, dd, dt, td, th, blockquote, figcaption, pre';

function findMainContent(): HTMLElement {
  for (const selector of MAIN_SELECTORS) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element && countJapaneseCharacters(element.innerText) > 50) return element;
  }
  // Fall back to the element that holds the most Japanese text in its paragraphs.
  let best: HTMLElement = document.body;
  let bestScore = 0;
  for (const paragraph of document.querySelectorAll<HTMLElement>('p')) {
    const parent = paragraph.parentElement;
    if (!parent) continue;
    const score = countJapaneseCharacters(parent.innerText);
    if (score > bestScore) {
      best = parent;
      bestScore = score;
    }
  }
  return best;
}

function leafBlocks(root: HTMLElement): HTMLElement[] {
  const blocks = [...root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)];
  // Count only the innermost blocks, so nested lists and quotes count once.
  return blocks.filter((block) => !block.querySelector(BLOCK_SELECTOR));
}

declare global {
  interface Window {
    __ntxArticleMode?: ArticleMode;
    __ntxArticleStarted?: boolean;
  }
}

/**
 * Start a manual reading timer on the current page.
 * The page mode counts the text of each block once, after it was visible.
 */
export function startArticleTracker(mode: ArticleMode) {
  const core = new TrackerCore('article', { wallClock: true });
  const activity = new ActivityWindow(core);
  const url = location.href.split('#')[0] ?? location.href;
  core.setIdentity({
    key: url,
    title: document.title,
    url,
    japanese: countKana(findMainContent().innerText) >= PAGE_MIN_KANA,
    meta: { site: location.hostname },
  });

  let chars = 0;
  if (mode === 'selection') {
    chars = countJapaneseCharacters(window.getSelection()?.toString() ?? '');
    core.setChars(chars);
  }

  if (mode === 'page') {
    const counted = new WeakSet<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || counted.has(entry.target)) continue;
          counted.add(entry.target);
          observer.unobserve(entry.target);
          chars += countJapaneseCharacters((entry.target as HTMLElement).innerText);
        }
        core.setChars(chars);
      },
      { threshold: 0.6 },
    );
    const observeAll = () => {
      for (const block of leafBlocks(findMainContent())) {
        if (!counted.has(block)) observer.observe(block);
      }
    };
    observeAll();
    // Some articles load more paragraphs while the user scrolls.
    setInterval(observeAll, 10_000);
  }

  const onInput = () => activity.signal();
  for (const event of ['scroll', 'wheel', 'keydown', 'mousemove', 'pointerdown', 'touchstart', 'selectionchange']) {
    document.addEventListener(event, onInput, { passive: true, capture: true });
  }
  activity.start();
  core.start();
  activity.signal();
}
