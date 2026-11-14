import { Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import type { Translate } from '@/lib/i18n';
import { sendToBackground, type ArticleMode } from '@/lib/messages';

const MODES: ArticleMode[] = ['page', 'selection', 'time'];

function canInject(url: string | undefined) {
  return Boolean(url && /^(https?|file):/.test(url) && !/chrome\.google\.com\/webstore|addons\.mozilla\.org|microsoftedge\.microsoft\.com\/addons/.test(url));
}

export function ArticleStarter({ t, hasSessionInTab }: { t: Translate; hasSessionInTab: (tabId: number) => boolean }) {
  const [tab, setTab] = useState<{ id?: number; url?: string; title?: string } | null>(null);
  const [mode, setMode] = useState<ArticleMode>('page');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void browser.tabs.query({ active: true, currentWindow: true }).then(([current]) => setTab(current ?? null));
  }, []);

  if (!tab?.id || hasSessionInTab(tab.id)) return null;
  const allowed = canInject(tab.url);
  const tabId = tab.id;

  const start = async (force = false) => {
    setBusy(true);
    setError(null);
    const result = await sendToBackground({ type: 'start-article', tabId, mode, force });
    setBusy(false);
    if (!result.ok) setError(result.error ?? 'error');
  };

  return (
    <div className="surface px-2.5 py-2">
      <div className="flex items-center gap-2">
        <Timer className="h-4 w-4 shrink-0 text-secondary" />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold" title={tab.title}>
          {t('article.title')}
        </span>
        {allowed && (
          <button type="button" className="btn btn-secondary btn-xs" disabled={busy} onClick={() => void start()}>
            {busy && <span className="loading loading-spinner loading-xs" />}
            {t('article.start')}
          </button>
        )}
      </div>
      {allowed ? (
        <>
          <div className="join mt-2 w-full">
            {MODES.map((value) => (
              <button
                key={value}
                type="button"
                className={
                  value === mode
                    ? 'join-item btn btn-secondary btn-xs flex-1'
                    : 'join-item btn btn-outline btn-xs flex-1'
                }
                title={t(`article.modeHint.${value}`)}
                onClick={() => setMode(value)}
              >
                {t(`article.mode.${value}`)}
              </button>
            ))}
          </div>
          {error === 'not-japanese' ? (
            <div className="mt-2 flex items-center gap-2">
              <p className="flex-1 text-xs text-warning">{t('article.notJapanese')}</p>
              <button type="button" className="btn btn-ghost btn-xs" disabled={busy} onClick={() => void start(true)}>
                {t('article.startAnyway')}
              </button>
            </div>
          ) : (
            error && <p className="mt-1 text-xs text-error">{error}</p>
          )}
        </>
      ) : (
        <p className="mt-1 text-xs text-base-content/60">{t('article.unavailable')}</p>
      )}
    </div>
  );
}
