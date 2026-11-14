import { useQuery } from '@tanstack/react-query';
import { CircleOff, Flame, LayoutDashboard, Link2, Moon, Settings as SettingsIcon, Sun } from 'lucide-react';
import { browser } from 'wxt/browser';
import { getDailyGoals, getMe, normalizeServerUrl } from '@/lib/api';
import type { Translate } from '@/lib/i18n';
import { sendToBackground } from '@/lib/messages';
import { updateStore } from '@/lib/storage';
import type { DailyGoal, NtUser } from '@/lib/types';
import { ArticleStarter } from '@/ui/ArticleStarter';
import { formatNumber, useAppliedTheme, useSettings, useStore, useTranslator } from '@/ui/hooks';
import { Queue } from '@/ui/Queue';
import { SessionCard } from '@/ui/SessionCard';
import { SkippedCard } from '@/ui/SkippedCard';
import { UserAvatar } from '@/ui/UserAvatar';

function openOptions() {
  void browser.runtime.openOptionsPage();
  window.close();
}

const DARK_THEMES = new Set(['dark', 'synthwave', 'halloween', 'forest', 'dracula', 'night', 'dim', 'sunset', 'abyss']);

function isDarkTheme(theme: string) {
  if (theme === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches;
  return DARK_THEMES.has(theme);
}

function Header({ t, user, connected, theme }: { t: Translate; user?: NtUser; connected: boolean; theme: string }) {
  const dark = isDarkTheme(theme);
  const toggleTheme = () => {
    void updateStore('settings', (settings) => ({ ...settings, theme: dark ? 'light' : 'dark' }));
  };
  return (
    <header className="flex items-center gap-2.5">
      <img src="/icon/48.png" alt="" className="h-9 w-9 rounded-field" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-tight font-bold">{t('app.name')}</p>
        {!connected && (
          <span className="badge badge-warning badge-soft badge-xs mt-0.5 gap-1 font-semibold">
            {t('header.offline')}
            <CircleOff className="h-3 w-3" />
          </span>
        )}
      </div>
      {user && (
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-base-content/60">
          <UserAvatar username={user.username} avatar={user.avatar} className="h-5 w-5" />
          <span className="max-w-24 truncate">@{user.username}</span>
        </span>
      )}
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-square"
        title={t('header.toggleTheme')}
        aria-label={t('header.toggleTheme')}
        onClick={toggleTheme}
      >
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-square"
        title={t('app.openSettings')}
        aria-label={t('app.openSettings')}
        onClick={openOptions}
      >
        <SettingsIcon className="h-4 w-4" />
      </button>
    </header>
  );
}

function StreakBar({ user, t, serverUrl }: { user: NtUser; t: Translate; serverUrl: string }) {
  const { currentStreak, longestStreak, userLevel, userXp, userXpToCurrentLevel, userXpToNextLevel } = user.stats;
  const span = Math.max(1, userXpToNextLevel - userXpToCurrentLevel);
  const progress = Math.min(100, Math.max(0, ((userXp - userXpToCurrentLevel) / span) * 100));
  return (
    <div className="surface px-3 py-2">
      <div className="flex items-center gap-2">
        <Flame className={currentStreak > 0 ? 'h-4 w-4 text-warning' : 'h-4 w-4 text-base-content/40'} />
        <span className="text-sm font-semibold">{t('streak.label', { days: currentStreak })}</span>
        {longestStreak !== undefined && (
          <span className="text-xs text-base-content/50">{t('streak.longest', { days: longestStreak })}</span>
        )}
        <span className="flex-1" />
        <a
          href={`${serverUrl}/user/${encodeURIComponent(user.username)}`}
          target="_blank"
          rel="noreferrer"
          className="btn btn-outline btn-xs"
        >
          <LayoutDashboard className="h-3.5 w-3.5" />
          {t('header.dashboard')}
        </a>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-xs font-semibold text-primary">{t('user.level', { level: userLevel })}</span>
        <progress className="progress progress-primary h-1 flex-1" value={progress} max={100} />
      </div>
    </div>
  );
}

function GoalChips({ username, t }: { username: string; t: Translate }) {
  const goals = useQuery({ queryKey: ['goals', username], queryFn: () => getDailyGoals(username) });
  const daily = (goals.data?.goals ?? []).filter(
    (goal: DailyGoal) => goal.isActive && (goal.cadence ?? 'daily') === 'daily',
  );
  if (!goals.data || daily.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {daily.slice(0, 4).map((goal, index) => {
        const value = goal._id ? (goals.data.goalProgress[goal._id] ?? 0) : 0;
        const done = value >= goal.target;
        return (
          <div key={goal._id ?? index} className="surface px-2 py-1.5">
            <p className="truncate text-[11px] text-base-content/70">
              {t(`goals.${goal.type}`, { value: formatNumber(value), target: formatNumber(goal.target) })}
            </p>
            <progress
              className={done ? 'progress progress-success h-1 w-full' : 'progress progress-primary h-1 w-full'}
              value={Math.min(value, goal.target)}
              max={goal.target}
            />
          </div>
        );
      })}
    </div>
  );
}

function ConnectCard({ t }: { t: Translate }) {
  return (
    <section className="surface p-3">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">{t('connect.title')}</h2>
      </div>
      <p className="mt-1 text-xs text-base-content/60">{t('connect.body')}</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm flex-1"
          onClick={() => void sendToBackground({ type: 'connect-start' }).then(() => window.close())}
        >
          {t('connect.button')}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={openOptions}>
          {t('connect.paste')}
        </button>
      </div>
    </section>
  );
}

export function App() {
  useAppliedTheme();
  const t = useTranslator();
  const [settings, settingsLoaded] = useSettings();
  const [sessions] = useStore('sessions', []);
  const [drafts] = useStore('drafts', []);
  const [skipped] = useStore('skipped', []);
  const serverUrl = normalizeServerUrl(settings.serverUrl);
  const connected = Boolean(settings.apiKey);

  const me = useQuery({
    queryKey: ['me', settings.apiKey, serverUrl],
    queryFn: () => getMe(),
    enabled: connected,
  });

  return (
    <div className="flex max-h-[600px] w-[390px] flex-col">
      <div className="flex flex-col gap-2.5 border-b border-base-300/60 p-3">
        <Header t={t} user={me.data} connected={connected} theme={settings.theme} />
        {settingsLoaded && !connected && <ConnectCard t={t} />}
        {connected && me.data && <StreakBar user={me.data} t={t} serverUrl={serverUrl} />}
        {connected && me.isLoading && <div className="skeleton h-14 w-full" />}
      </div>

      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {sessions.length > 0 && (
          <ul className="flex flex-col gap-2">
            {sessions.map((session) => (
              <SessionCard key={session.id} session={session} t={t} />
            ))}
          </ul>
        )}
        <SkippedCard items={skipped} t={t} />
        <ArticleStarter
          t={t}
          hasSessionInTab={(tabId) =>
            sessions.some((session) => session.tabId === tabId && session.source === 'article')
          }
        />
        <Queue drafts={drafts} t={t} connected={connected} serverUrl={serverUrl} />
        {connected && me.data && <GoalChips username={me.data.username} t={t} />}
      </main>

      <footer className="border-t border-base-300/60 p-2">
        <button type="button" className="btn btn-ghost btn-sm w-full" onClick={openOptions}>
          <SettingsIcon className="h-4 w-4" />
          {t('footer.settings')}
        </button>
      </footer>
    </div>
  );
}
