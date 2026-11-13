import { defineContentScript } from 'wxt/utils/define-content-script';
import { readStore } from '@/lib/storage';
import { startYouTubeTracker } from '@/lib/trackers/youtube';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_idle',
  async main() {
    const settings = await readStore('settings');
    if (settings.trackYouTube) startYouTubeTracker();
  },
});
