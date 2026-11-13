import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { startGenericVideoTracker } from '@/lib/trackers/genericVideo';

declare global {
  interface Window {
    __ntxVideoStarted?: boolean;
  }
}

export default defineUnlistedScript(() => {
  if (window.__ntxVideoStarted) return;
  window.__ntxVideoStarted = true;
  startGenericVideoTracker();
});
