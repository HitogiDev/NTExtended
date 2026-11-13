import { useQuery } from '@tanstack/react-query';
import { Check, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { browser } from 'wxt/browser';
import { getMe, normalizeServerUrl } from '@/lib/api';
import type { Translate } from '@/lib/i18n';
import { sendToBackground } from '@/lib/messages';
import { readStore, updateStore } from '@/lib/storage';
import type { Settings } from '@/lib/types';
import { THEMES, useAppliedTheme, useSettings, useTranslator } from '@/ui/hooks';
import { UserAvatar } from '@/ui/UserAvatar';

const SITE_PRESETS: Array<{ label: string; origins: string[] }> = [
  { label: 'Netflix', origins: ['*://*.netflix.com/*'] },
  { label: 'Crunchyroll', origins: ['*://*.crunchyroll.com/*'] },
  { label: 'Prime Video', origins: ['*://*.primevideo.com/*', '*://*.amazon.co.jp/*'] },
  { label: 'Disney+', origins: ['*://*.disneyplus.com/*'] },
  { label: 'HIDIVE', origins: ['*://*.hidive.com/*'] },
  { label: 'Bilibili', origins: ['*://*.bilibili.com/*', '*://*.bilibili.tv/*'] },
  { label: 'Niconico', origins: ['*://*.nicovideo.jp/*', '*://*.nimg.jp/*'] },
  { label: 'ABEMA', origins: ['*://abema.tv/*'] },
  { label: 'TVer', origins: ['*://tver.jp/*', '*://*.tver.jp/*'] },
  { label: 'U-NEXT', origins: ['*://*.unext.jp/*'] },
];

function originFromDomain(input: string): string | null {
  const domain = input
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
  return `*://*.${domain.replace(/^www\./, '')}/*`;
}

function serverPermission(serverUrl: string) {
  return `${new URL(normalizeServerUrl(serverUrl)).origin}/*`;
}

function save(update: (settings: Settings) => Settings) {
  return updateStore('settings', update);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card surface">
      <div className="card-body gap-4">
        <h2 className="card-title text-base">{title}</h2>
        {children}
      </div>
    </section>
  );
}

function AccountSection({ settings, t }: { settings: Settings; t: Translate }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const me = useQuery({
    queryKey: ['me', settings.apiKey, settings.serverUrl],
    queryFn: () => getMe(),
    enabled: Boolean(settings.apiKey),
  });

  const saveKey = async () => {
    setBusy(true);
    setError(null);
    const result = await sendToBackground({ type: 'set-api-key', key });
    setBusy(false);
    if (result.ok) setKey('');
    else setError(t('connect.invalid'));
  };

  if (settings.apiKey) {
    return (
      <Section title={t('options.account')}>
        <div className="flex items-center gap-3">
          <UserAvatar username={me.data?.username} avatar={me.data?.avatar} />
          <p className="flex-1 text-sm">
            {me.data ? t('connect.connected', { username: me.data.username }) : <span className="loading loading-dots loading-sm" />}
          </p>
          <button
            type="button"
            className="btn btn-sm btn-outline btn-error"
            onClick={() => void sendToBackground({ type: 'disconnect' })}
          >
            {t('connect.disconnect')}
          </button>
        </div>
        {me.error && <p className="text-sm text-error">{(me.error as Error).message}</p>}
        <p className="text-xs text-base-content/60">{t('connect.revokeHint')}</p>
      </Section>
    );
  }

  return (
    <Section title={t('options.account')}>
      <p className="text-sm text-base-content/70">{t('connect.body')}</p>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => void sendToBackground({ type: 'connect-start' })}
      >
        {t('connect.button')}
      </button>
      <div className="divider my-0 text-xs">{t('connect.paste')}</div>
      <div className="join w-full">
        <input
          type="password"
          autoComplete="off"
          className="input join-item w-full focus:input-primary"
          placeholder={t('connect.keyPlaceholder')}
          value={key}
          onChange={(event) => setKey(event.target.value)}
        />
        <button type="button" className="join-item btn" disabled={busy || !key.trim()} onClick={() => void saveKey()}>
          {busy && <span className="loading loading-spinner loading-xs" />}
          {t('connect.saveKey')}
        </button>
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
    </Section>
  );
}

function ServerSection({ settings, t }: { settings: Settings; t: Translate }) {
  const [value, setValue] = useState(settings.serverUrl);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => setValue(settings.serverUrl), [settings.serverUrl]);

  const submit = async () => {
    setError(null);
    let url: string;
    try {
      url = normalizeServerUrl(new URL(value).toString());
    } catch {
      setError('URL');
      return;
    }
    // The permission request must run directly from the click.
    const granted = await browser.permissions.request({ origins: [serverPermission(url)] });
    if (!granted) {
      setError(t('options.serverPermission'));
      return;
    }
    await save((current) => ({ ...current, serverUrl: url, apiKey: url === current.serverUrl ? current.apiKey : '' }));
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <Section title={t('options.server')}>
      <div className="join w-full">
        <input
          type="url"
          className="input join-item w-full focus:input-primary"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <button type="button" className="join-item btn" onClick={() => void submit()}>
          {saved ? <Check className="h-4 w-4" /> : t('options.serverSave')}
        </button>
      </div>
      <p className="text-xs text-base-content/60">{t('options.serverHint')}</p>
      {error && <p className="text-sm text-error">{error}</p>}
    </Section>
  );
}

function NumberSetting({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        className="input input-sm w-24 focus:input-primary"
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
        }}
      />
    </label>
  );
}

function ToggleSetting({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      <input
        type="checkbox"
        className="toggle toggle-primary"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function TrackingSection({ settings, t }: { settings: Settings; t: Translate }) {
  return (
    <Section title={t('options.tracking')}>
      <ToggleSetting
        label={t('options.trackYouTube')}
        checked={settings.trackYouTube}
        onChange={(value) => void save((current) => ({ ...current, trackYouTube: value }))}
      />
      <ToggleSetting
        label={t('options.trackReaders')}
        checked={settings.trackReaders}
        onChange={(value) => void save((current) => ({ ...current, trackReaders: value }))}
      />
      <ToggleSetting
        label={t('options.privateByDefault')}
        checked={settings.privateByDefault}
        onChange={(value) => void save((current) => ({ ...current, privateByDefault: value }))}
      />
      <NumberSetting
        label={t('options.minSession')}
        value={settings.minSessionMinutes}
        min={0}
        max={60}
        onChange={(value) => void save((current) => ({ ...current, minSessionMinutes: value }))}
      />
      <NumberSetting
        label={t('options.idle')}
        value={settings.idleMinutes}
        min={1}
        max={60}
        onChange={(value) => void save((current) => ({ ...current, idleMinutes: value }))}
      />
      <NumberSetting
        label={t('options.autoFinish')}
        value={settings.autoFinishMinutes}
        min={5}
        max={720}
        onChange={(value) => void save((current) => ({ ...current, autoFinishMinutes: value }))}
      />
    </Section>
  );
}

function SitesSection({ settings, t }: { settings: Settings; t: Translate }) {
  const [custom, setCustom] = useState('');
  const enabled = new Set(settings.videoSites);

  const enable = async (origins: string[]) => {
    const granted = await browser.permissions.request({ origins });
    if (!granted) return;
    await save((current) => ({ ...current, videoSites: [...new Set([...current.videoSites, ...origins])] }));
    await sendToBackground({ type: 'sync-video-sites' });
  };

  const disable = async (origins: string[]) => {
    await save((current) => ({
      ...current,
      videoSites: current.videoSites.filter((origin) => !origins.includes(origin)),
    }));
    await browser.permissions.remove({ origins }).catch(() => false);
    await sendToBackground({ type: 'sync-video-sites' });
  };

  const presetOrigins = new Set(SITE_PRESETS.flatMap((preset) => preset.origins));
  const customOrigins = settings.videoSites.filter((origin) => !presetOrigins.has(origin));

  return (
    <Section title={t('options.sites')}>
      <p className="text-xs text-base-content/60">{t('options.sitesHint')}</p>
      <div className="grid grid-cols-2 gap-2">
        {SITE_PRESETS.map((preset) => {
          const on = preset.origins.every((origin) => enabled.has(origin));
          return (
            <label key={preset.label} className="surface-muted flex cursor-pointer items-center justify-between px-3 py-2">
              <span className="text-sm">{preset.label}</span>
              <input
                type="checkbox"
                className="toggle toggle-sm toggle-primary"
                checked={on}
                onChange={(event) => void (event.target.checked ? enable(preset.origins) : disable(preset.origins))}
              />
            </label>
          );
        })}
      </div>
      {customOrigins.length > 0 && (
        <ul className="flex flex-col gap-1">
          {customOrigins.map((origin) => (
            <li key={origin} className="surface-muted flex items-center justify-between px-3 py-1.5 text-sm">
              <code>{origin}</code>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-square"
                title={t('options.remove')}
                aria-label={t('options.remove')}
                onClick={() => void disable([origin])}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="join w-full">
        <input
          type="text"
          className="input join-item w-full focus:input-primary"
          placeholder={t('options.customSite')}
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
        />
        <button
          type="button"
          className="join-item btn"
          disabled={!originFromDomain(custom)}
          onClick={() => {
            const origin = originFromDomain(custom);
            if (origin) void enable([origin]).then(() => setCustom(''));
          }}
        >
          <Plus className="h-4 w-4" />
          {t('options.addSite')}
        </button>
      </div>
    </Section>
  );
}

function AppearanceSection({ settings, t }: { settings: Settings; t: Translate }) {
  return (
    <Section title={t('options.appearance')}>
      <label className="flex items-center justify-between gap-4">
        <span className="text-sm">{t('options.theme')}</span>
        <select
          className="select select-sm w-48 focus:select-primary"
          value={settings.theme}
          onChange={(event) => {
            // Read the value now. React resets the controlled select before the save runs.
            const theme = event.target.value;
            void save((current) => ({ ...current, theme }));
          }}
        >
          <option value="system">{t('options.themeSystem')}</option>
          {THEMES.map((theme) => (
            <option key={theme} value={theme}>
              {theme}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-4">
        <span className="text-sm">{t('options.language')}</span>
        <select
          className="select select-sm w-48 focus:select-primary"
          value={settings.language}
          onChange={(event) => {
            const language = event.target.value as Settings['language'];
            void save((current) => ({ ...current, language }));
          }}
        >
          <option value="auto">{t('options.languageAuto')}</option>
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
      </label>
    </Section>
  );
}

export function App() {
  useAppliedTheme();
  const t = useTranslator();
  const [settings, loaded] = useSettings();

  useEffect(() => {
    document.title = t('options.title');
  }, [t]);

  useEffect(() => {
    // Settings saved by an older version can miss new fields. Write the merged value once.
    void readStore('settings').then((value) => updateStore('settings', () => value));
  }, []);

  if (!loaded) return null;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <header className="flex items-center gap-3">
        <img src="/icon/48.png" alt="" className="h-10 w-10" />
        <div>
          <h1 className="text-xl font-bold">{t('options.title')}</h1>
          <p className="text-xs text-base-content/60">{t('options.privacy')}</p>
        </div>
      </header>
      <AccountSection settings={settings} t={t} />
      <TrackingSection settings={settings} t={t} />
      <SitesSection settings={settings} t={t} />
      <AppearanceSection settings={settings} t={t} />
      <ServerSection settings={settings} t={t} />
    </main>
  );
}
