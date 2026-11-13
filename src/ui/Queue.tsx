import { AlertCircle, Check, ChevronDown, ChevronRight, Link2, Pencil, Search, Send, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { translateError, type Translate } from '@/lib/i18n';
import { sendToBackground } from '@/lib/messages';
import type { Draft, SourceKind } from '@/lib/types';
import { DraftEditor } from './DraftEditor';
import { formatNumber } from './hooks';
import { MEDIA_TYPE_CLASSES } from './mediaColors';

type Filter = 'all' | 'video' | 'reading' | 'other';

const FILTERS: Filter[] = ['all', 'video', 'reading', 'other'];

function draftCategory(draft: Draft): Exclude<Filter, 'all'> {
  if (draft.type === 'video' || draft.type === 'anime' || draft.type === 'tv show' || draft.type === 'movie') {
    return 'video';
  }
  if (draft.type === 'reading' || draft.type === 'light-novel' || draft.type === 'manga' || draft.type === 'vn') {
    return 'reading';
  }
  return 'other';
}

interface DraftGroup {
  key: string;
  drafts: Draft[];
}

/** Group the drafts of one work, so several sessions of a book or channel appear together. */
function groupDrafts(drafts: Draft[]): DraftGroup[] {
  const groups = new Map<string, Draft[]>();
  for (const draft of drafts) {
    const media = draft.media?.contentId ?? draft.mediaTitle.trim().toLowerCase();
    const key = `${draft.type}::${media}`;
    groups.set(key, [...(groups.get(key) ?? []), draft]);
  }
  return [...groups.entries()].map(([key, items]) => ({
    key,
    drafts: items.sort((a, b) => a.endedAt - b.endedAt),
  }));
}

function sourceLabel(source: SourceKind, t: Translate) {
  return t(`source.${source}`);
}

function SessionRow({ draft, index, t, connected }: { draft: Draft; index: number; t: Translate; connected: boolean }) {
  const [editing, setEditing] = useState(false);
  const sending = draft.status === 'sending';
  return (
    <li className="rounded-field px-2 py-1 hover:bg-base-300/40">
      <div className="flex items-center gap-2 text-xs">
        <span className="w-5 font-mono text-primary">s{index + 1}</span>
        <span className="min-w-0 flex-1 truncate">
          {draft.chars > 0 && (
            <>
              <span className="font-semibold text-primary">{formatNumber(draft.chars)}</span>{' '}
              <span className="text-base-content/60">{t('queue.charsShort')}</span>{' '}
            </>
          )}
          <span className="font-semibold text-primary">{draft.time}</span>{' '}
          <span className="text-base-content/60">min</span>
          {draft.episodes > 0 && <span className="text-base-content/60"> · {draft.episodes} ep.</span>}
        </span>
        <span className="text-base-content/50 tabular-nums">{draft.date}</span>
        {draft.status === 'error' && (
          <span className="tooltip tooltip-left" data-tip={translateError(t, draft.error)}>
            <AlertCircle className="h-3.5 w-3.5 text-error" />
          </span>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-square"
          title={t('queue.send')}
          aria-label={t('queue.send')}
          disabled={!connected || sending}
          onClick={() => void sendToBackground({ type: 'send-draft', id: draft.id })}
        >
          {sending ? <span className="loading loading-spinner loading-xs" /> : <Send className="h-3.5 w-3.5 text-primary" />}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-square"
          title={t('queue.editSession')}
          aria-label={t('queue.editSession')}
          disabled={sending}
          onClick={() => setEditing((value) => !value)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-square"
          title={t('queue.removeSession')}
          aria-label={t('queue.removeSession')}
          disabled={sending}
          onClick={() => void sendToBackground({ type: 'delete-draft', id: draft.id })}
        >
          <X className="h-3.5 w-3.5 text-error" />
        </button>
      </div>
      {editing && <DraftEditor draft={draft} t={t} onClose={() => setEditing(false)} />}
    </li>
  );
}

function GroupCard({ group, t, connected }: { group: DraftGroup; t: Translate; connected: boolean }) {
  const [open, setOpen] = useState(group.drafts.length > 1);
  const [editing, setEditing] = useState(false);
  const first = group.drafts[0]!;
  const title = first.media?.title || first.mediaTitle;
  const linked = Boolean(first.media);
  const totals = group.drafts.reduce(
    (sum, draft) => ({
      chars: sum.chars + draft.chars,
      time: sum.time + draft.time,
      episodes: sum.episodes + draft.episodes,
    }),
    { chars: 0, time: 0, episodes: 0 },
  );
  const sendingAny = group.drafts.some((draft) => draft.status === 'sending');
  const typeClasses = MEDIA_TYPE_CLASSES[first.type];
  const ids = group.drafts.map((draft) => draft.id);
  const subtitle = [sourceLabel(first.source, t), first.source === 'youtube' ? first.description : first.url]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="surface overflow-hidden">
      <div className={`border-l-2 ${typeClasses.border} p-3`}>
        <div className="flex items-start gap-2">
          <span className="mt-0.5" title={linked ? t('queue.linked') : t('queue.unlinked')}>
            {linked ? <Link2 className="h-4 w-4 text-success" /> : <Search className="h-4 w-4 text-base-content/50" />}
          </span>
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            title={t('queue.editGroup')}
            onClick={() => setEditing((value) => !value)}
          >
            <p className="truncate text-sm font-semibold">{title}</p>
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-square"
            title={t('queue.removeGroup')}
            aria-label={t('queue.removeGroup')}
            disabled={sendingAny}
            onClick={() => void sendToBackground({ type: 'delete-drafts', ids })}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-1 flex items-center gap-2 text-xs">
          <span className={`badge badge-xs border ${typeClasses.bg} ${typeClasses.border} ${typeClasses.text}`}>
            {t(`type.${first.type}`)}
          </span>
          {totals.chars > 0 && (
            <span>
              <span className="font-semibold text-primary">{formatNumber(totals.chars)}</span>{' '}
              <span className="text-base-content/60">{t('editor.chars').toLowerCase()}</span>
            </span>
          )}
          <span>
            <span className="font-semibold text-primary">{totals.time}</span>{' '}
            <span className="text-base-content/60">min</span>
          </span>
          {totals.episodes > 0 && <span className="text-base-content/60">{totals.episodes} ep.</span>}
        </div>
        {subtitle && <p className="mt-0.5 truncate text-xs text-base-content/50" title={subtitle}>{subtitle}</p>}

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-base-content/50 tabular-nums">
            {first.date}
            {group.drafts.length > 1 && group.drafts.at(-1)!.date !== first.date && ` – ${group.drafts.at(-1)!.date}`}
          </span>
          <button
            type="button"
            className="btn btn-primary btn-xs"
            disabled={!connected || sendingAny}
            onClick={() => void sendToBackground({ type: 'send-drafts', ids })}
          >
            {sendingAny ? <span className="loading loading-spinner loading-xs" /> : <Send className="h-3.5 w-3.5" />}
            {t('queue.send')}
          </button>
        </div>

        {editing && <DraftEditor draft={first} t={t} onClose={() => setEditing(false)} applyTo={ids} />}
      </div>

      <div className="border-t border-base-300/60 bg-base-200/40">
        <button
          type="button"
          className="flex w-full items-center gap-1 px-3 py-1.5 text-xs font-medium text-base-content/70"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {t('queue.sessions', { count: group.drafts.length })}
        </button>
        {open && (
          <ul className="px-1 pb-2">
            {group.drafts.map((draft, index) => (
              <SessionRow key={draft.id} draft={draft} index={index} t={t} connected={connected} />
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export function Queue({
  drafts,
  t,
  connected,
  serverUrl,
}: {
  drafts: Draft[];
  t: Translate;
  connected: boolean;
  serverUrl: string;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [confirmClear, setConfirmClear] = useState(false);
  const pending = drafts.filter((draft) => draft.status !== 'sent');
  const visible = pending.filter((draft) => filter === 'all' || draftCategory(draft) === filter);
  const groups = useMemo(() => groupDrafts(visible), [visible]);
  const sent = drafts.filter((draft) => draft.status === 'sent').slice(0, 5);
  const visibleIds = visible.filter((draft) => draft.status !== 'sending').map((draft) => draft.id);
  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: pending.length, video: 0, reading: 0, other: 0 };
    for (const draft of pending) result[draftCategory(draft)] += 1;
    return result;
  }, [pending]);

  const clear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    setConfirmClear(false);
    void sendToBackground({ type: 'delete-drafts', ids: visibleIds });
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-semibold tracking-widest text-base-content/70 uppercase">{t('queue.title')}</h2>
        <span className="badge badge-primary badge-sm">{pending.length}</span>
        <span className="flex-1" />
        <button
          type="button"
          className="btn btn-primary btn-xs"
          disabled={!connected || visibleIds.length === 0}
          title={connected ? undefined : t('drafts.notConnected')}
          onClick={() => void sendToBackground({ type: 'send-drafts', ids: visibleIds })}
        >
          {t('queue.sendAll')}
        </button>
        <button
          type="button"
          className={confirmClear ? 'btn btn-error btn-xs' : 'btn btn-outline btn-xs'}
          disabled={visibleIds.length === 0}
          onClick={clear}
        >
          {confirmClear ? t('queue.clearConfirm', { count: visibleIds.length }) : t('queue.clear')}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.filter((value) => value === 'all' || counts[value] > 0).map((value) => (
          <button
            key={value}
            type="button"
            className={value === filter ? 'btn btn-primary btn-xs' : 'btn btn-outline btn-xs'}
            onClick={() => setFilter(value)}
          >
            {t(`queue.filter.${value}`)}
            {value !== 'all' && <span className="opacity-70">{counts[value]}</span>}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="surface p-3 text-xs text-base-content/60">{t('drafts.none')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.map((group) => (
            <GroupCard key={group.key} group={group} t={t} connected={connected} />
          ))}
        </ul>
      )}

      {sent.length > 0 && (
        <details className="surface px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-base-content/70">{t('queue.sentToday')}</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {sent.map((draft) => (
              <li key={draft.id} className="flex items-center gap-2 text-xs">
                <Check className="h-3.5 w-3.5 text-success" />
                {draft.logId ? (
                  <a
                    className="link-hover min-w-0 flex-1 truncate"
                    href={`${serverUrl}/shared-log/${draft.logId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {draft.media?.title || draft.mediaTitle}
                  </a>
                ) : (
                  <span className="min-w-0 flex-1 truncate">{draft.media?.title || draft.mediaTitle}</span>
                )}
                {draft.xp !== undefined && (
                  <span className="font-semibold text-primary">{t('drafts.sentXp', { xp: draft.xp })}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
