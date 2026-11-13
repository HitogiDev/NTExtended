import { defineContentScript } from 'wxt/utils/define-content-script';
import { readStore } from '@/lib/storage';
import { startReaderTracker } from '@/lib/trackers/reader';

export default defineContentScript({
  matches: ['https://reader.ttsu.app/*', 'https://app.yatsu.moe/*'],
  runAt: 'document_idle',
  async main() {
    const settings = await readStore('settings');
    if (!settings.trackReaders) return;
    startReaderTracker(location.hostname === 'app.yatsu.moe' ? 'yatsu' : 'ttsu');
  },
});
