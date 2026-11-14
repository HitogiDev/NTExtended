import { Languages, X } from 'lucide-react';
import type { Translate } from '@/lib/i18n';
import { sendToBackground } from '@/lib/messages';
import type { SkippedContent } from '@/lib/storage';
import { SourceIcon } from './SourceIcon';

/** Show content that the language rule skipped, with a way to track it anyway. */
export function SkippedCard({ items, t }: { items: SkippedContent[]; t: Translate }) {
  if (items.length === 0) return null;
  return (
    <section className="surface p-2.5">
      <div className="flex items-center gap-2">
        <Languages className="h-4 w-4 text-warning" />
        <h2 className="text-xs font-semibold">{t('skipped.title')}</h2>
      </div>
      <ul className="mt-2 flex flex-col gap-2">
        {items.slice(0, 3).map((item) => (
          <li key={`${item.tabId}::${item.key}`} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <SourceIcon source={item.source} className="h-3.5 w-3.5 shrink-0 text-base-content/50" />
              <span className="min-w-0 flex-1 truncate text-xs" title={item.title}>
                {item.title}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-square"
                title={t('skipped.dismiss')}
                aria-label={t('skipped.dismiss')}
                onClick={() => void sendToBackground({ type: 'dismiss-skipped', tabId: item.tabId, key: item.key })}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                className="btn btn-outline btn-xs flex-1"
                onClick={() => void sendToBackground({ type: 'allow-content', tabId: item.tabId, key: item.key })}
              >
                {t('skipped.trackAnyway')}
              </button>
              {item.host && item.source !== 'youtube' && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs flex-1"
                  onClick={() =>
                    void sendToBackground({
                      type: 'allow-content',
                      tabId: item.tabId,
                      key: item.key,
                      trustHost: item.host,
                    })
                  }
                >
                  <span className="truncate">{t('skipped.trustSite', { host: item.host })}</span>
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
