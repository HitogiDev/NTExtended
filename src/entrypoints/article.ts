import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { startArticleTracker } from '@/lib/trackers/article';

export default defineUnlistedScript(() => {
  if (window.__ntxArticleStarted) return;
  window.__ntxArticleStarted = true;
  startArticleTracker(window.__ntxArticleMode ?? 'page');
});
