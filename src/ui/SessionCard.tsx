import { CircleStop, Pause, Play, Trash2 } from 'lucide-react';
import type { Translate } from '@/lib/i18n';
import { sendToBackground } from '@/lib/messages';
import type { Session } from '@/lib/types';
import { formatDuration, formatNumber, useNow } from './hooks';
import { SourceIcon } from './SourceIcon';

export function SessionCard({ session, t }: { session: Session; t: Translate }) {
  const now = useNow();
  // Reports arrive every 15 seconds. Extend the shown time locally between them.
  const liveSeconds =
    session.activeSeconds + (session.active ? Math.min(20, (now - session.updatedAt) / 1000) : 0);
  const speed = liveSeconds > 60 && session.chars > 0 ? (session.chars / liveSeconds) * 3600 : 0;
  const control = (action: 'pause' | 'resume' | 'finish' | 'discard') =>
    void sendToBackground({ type: 'control', sessionId: session.id, action });
  const state = session.active
    ? t('session.active')
    : session.manualPause
      ? t('session.manualPause')
      : t('session.paused');

  return (
    <li className="surface p-2.5">
      <div className="flex items-center gap-2.5">
        <div className="relative rounded-field bg-primary/10 p-2 text-primary">
          <SourceIcon source={session.source} className="h-4 w-4" />
          <span
            className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-base-100 ${session.active ? 'bg-success' : 'bg-base-content/30'}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" title={session.title}>
            {session.title}
          </p>
          <p className="truncate text-xs text-base-content/60">
            {t(`source.${session.source}`)} · {state}
            {session.chars > 0 && (
              <>
                {' · '}
                <span className="font-semibold text-primary">{formatNumber(session.chars)}</span>{' '}
                {t('editor.chars').toLowerCase()}
              </>
            )}
            {speed > 0 && ` · ${t('session.speed', { count: formatNumber(speed) })}`}
          </p>
        </div>
        <span className="font-mono text-lg font-semibold tabular-nums">{formatDuration(liveSeconds)}</span>
      </div>
      {session.warning === 'counter-hidden' && (
        <p className="mt-1.5 text-xs text-warning">{t('session.counterHidden')}</p>
      )}
      <div className="mt-2 flex gap-1.5">
        {session.manualPause ? (
          <button type="button" className="btn btn-xs flex-1" onClick={() => control('resume')}>
            <Play className="h-3.5 w-3.5" />
            {t('session.resume')}
          </button>
        ) : (
          <button type="button" className="btn btn-xs flex-1" onClick={() => control('pause')}>
            <Pause className="h-3.5 w-3.5" />
            {t('session.pause')}
          </button>
        )}
        <button type="button" className="btn btn-primary btn-xs flex-1" onClick={() => control('finish')}>
          <CircleStop className="h-3.5 w-3.5" />
          {t('session.finish')}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-square"
          title={t('session.discard')}
          aria-label={t('session.discard')}
          onClick={() => control('discard')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}
