import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { isSearchableType, searchMedia } from '@/lib/api';
import type { Translate } from '@/lib/i18n';
import { sendToBackground } from '@/lib/messages';
import { readStore } from '@/lib/storage';
import { LOG_TYPES, type Draft, type LogType, type MediaChoice } from '@/lib/types';

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-base-content/70">{label}</span>
      <input
        type="number"
        min={0}
        className="input input-sm w-full focus:input-primary"
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
      />
    </label>
  );
}

function MediaPicker({
  type,
  value,
  initialQuery,
  onChange,
  t,
}: {
  type: LogType;
  value?: MediaChoice;
  initialQuery: string;
  onChange: (media?: MediaChoice) => void;
  t: Translate;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<MediaChoice[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (value || !isSearchableType(type) || query.trim().length < 2) {
      setResults(null);
      return;
    }
    let alive = true;
    setLoading(true);
    const timer = setTimeout(() => {
      searchMedia(type, query)
        .then((items) => alive && setResults(items))
        .catch(() => alive && setResults([]))
        .finally(() => alive && setLoading(false));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, type, value]);

  if (value) {
    return (
      <div className="surface-muted flex items-center gap-2 p-2">
        {value.image && <img src={value.image} alt="" className="h-10 w-8 rounded object-cover" />}
        <span className="min-w-0 flex-1 truncate text-sm">{value.title}</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-square"
          title={t('editor.mediaClear')}
          aria-label={t('editor.mediaClear')}
          onClick={() => onChange(undefined)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (!isSearchableType(type)) {
    return <p className="text-xs text-base-content/60">{t('editor.mediaNone')}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="input input-sm w-full focus-within:input-primary">
        <Search className="h-4 w-4 opacity-60" />
        <input
          type="search"
          className="grow"
          placeholder={t('editor.mediaSearch')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {loading && <span className="loading loading-spinner loading-xs" />}
      </label>
      {results && (
        <ul className="surface-muted max-h-40 overflow-y-auto p-1">
          {results.length === 0 && <li className="p-2 text-xs text-base-content/60">{t('editor.noResults')}</li>}
          {results.map((item) => (
            <li key={item.contentId}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-field p-1.5 text-left hover:bg-base-300/60"
                onClick={() => onChange(item)}
              >
                {item.image ? (
                  <img src={item.image} alt="" className="h-9 w-7 rounded object-cover" />
                ) : (
                  <span className="h-9 w-7 rounded bg-base-300" />
                )}
                <span className="line-clamp-2 text-xs">{item.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Edit one draft. With applyTo, edit the shared fields of a group of drafts:
 * type, media, title and privacy. Each draft keeps its own counters and date.
 */
export function DraftEditor({
  draft,
  t,
  onClose,
  applyTo,
}: {
  draft: Draft;
  t: Translate;
  onClose: () => void;
  applyTo?: string[];
}) {
  const isGroup = Boolean(applyTo);
  const [value, setValue] = useState<Draft>(draft);
  const set = <K extends keyof Draft>(key: K, next: Draft[K]) => setValue((current) => ({ ...current, [key]: next }));

  const changeType = (type: LogType) =>
    setValue((current) => ({
      ...current,
      type,
      // A media of another type cannot be linked to this log.
      media: current.media?.type === type ? current.media : undefined,
      episodes: type === 'anime' ? Math.max(1, current.episodes) : current.episodes,
    }));

  const save = async () => {
    if (!applyTo) {
      await sendToBackground({ type: 'update-draft', draft: value });
      onClose();
      return;
    }
    const drafts = await readStore('drafts');
    for (const item of drafts.filter((entry) => applyTo.includes(entry.id))) {
      await sendToBackground({
        type: 'update-draft',
        draft: {
          ...item,
          type: value.type,
          media: value.media,
          mediaTitle: value.mediaTitle,
          private: value.private,
          episodes: value.type === 'anime' ? Math.max(1, item.episodes) : item.episodes,
        },
      });
    }
    onClose();
  };

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-base-300/60 pt-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-base-content/70">{t('editor.type')}</span>
        <select
          className="select select-sm w-full focus:select-primary"
          value={value.type}
          onChange={(event) => changeType(event.target.value as LogType)}
        >
          {LOG_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`type.${type}`)}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-base-content/70">{t('editor.media')}</span>
        <MediaPicker
          type={value.type}
          value={value.media}
          initialQuery={value.mediaTitle}
          onChange={(media) => set('media', media)}
          t={t}
        />
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-base-content/70">{t('editor.title')}</span>
        <input
          type="text"
          className="input input-sm w-full focus:input-primary"
          value={value.mediaTitle}
          onChange={(event) => set('mediaTitle', event.target.value)}
        />
      </label>

      {!isGroup && (
      <label className="flex flex-col gap-1">
        <span className="text-xs text-base-content/70">{t('editor.description')}</span>
        <textarea
          rows={2}
          className="textarea textarea-sm w-full focus:textarea-primary"
          value={value.description}
          onChange={(event) => set('description', event.target.value)}
        />
      </label>
      )}

      {!isGroup && (
      <div className="grid grid-cols-2 gap-2">
        <NumberField label={t('editor.time')} value={value.time} onChange={(next) => set('time', next)} />
        <NumberField label={t('editor.chars')} value={value.chars} onChange={(next) => set('chars', next)} />
        {(value.type === 'anime' || value.type === 'tv show') && (
          <NumberField
            label={t('editor.episodes')}
            value={value.episodes}
            onChange={(next) => set('episodes', next)}
          />
        )}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-base-content/70">{t('editor.date')}</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{4}-\d{2}-\d{2}"
            placeholder="YYYY-MM-DD"
            className="input input-sm w-full focus:input-primary"
            value={value.date}
            onChange={(event) => set('date', event.target.value)}
          />
        </label>
      </div>
      )}

      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          className="toggle toggle-sm toggle-primary"
          checked={value.private}
          onChange={(event) => set('private', event.target.checked)}
        />
        <span className="text-sm">{t('editor.private')}</span>
      </label>

      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          {t('editor.cancel')}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!/^\d{4}-\d{2}-\d{2}$/.test(value.date)}
          onClick={() => void save()}
        >
          {t('editor.save')}
        </button>
      </div>
    </div>
  );
}
