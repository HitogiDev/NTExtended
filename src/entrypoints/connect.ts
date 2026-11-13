import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { browser } from 'wxt/browser';

declare global {
  interface Window {
    __ntxConnectStarted?: boolean;
  }
}

const browserName = navigator.userAgent.includes('Firefox')
  ? 'Firefox'
  : navigator.userAgent.includes('Edg/')
    ? 'Edge'
    : 'Chrome';

/**
 * Bridge between the NihongoTracker connect page and the background.
 * The background accepts the key only from the tab that it opened.
 */
export default defineUnlistedScript(() => {
  if (window.__ntxConnectStarted) return;
  window.__ntxConnectStarted = true;

  const hello = () =>
    window.postMessage({ type: 'ntextended:hello', browser: browserName }, location.origin);

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data as { type?: string; key?: unknown } | null;
    if (data?.type === 'ntextended:ping') hello();
    if (data?.type === 'ntextended:api-key' && typeof data.key === 'string') {
      void browser.runtime
        .sendMessage({ type: 'connect-key', key: data.key })
        .then((result: { ok?: boolean; error?: string } | undefined) => {
          window.postMessage(
            { type: 'ntextended:connected', ok: Boolean(result?.ok), error: result?.error },
            location.origin,
          );
        });
    }
  });
  hello();
});
