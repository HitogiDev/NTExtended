import { looksJapanese } from '../japanese';
import { TrackerCore } from './core';
import { PlaybackMeter } from './playback';

function readVideoId(url: URL): string | null {
  if (url.pathname === '/watch') return url.searchParams.get('v');
  const match = url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{6,})/);
  return match?.[1] ?? null;
}

function readTitle(): string {
  const heading = document.querySelector<HTMLElement>(
    'ytd-watch-metadata h1, h1.ytd-watch-metadata, #title h1, ytd-reel-video-renderer[is-active] h2',
  );
  const text = heading?.innerText.trim();
  if (text) return text;
  return document.title.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube$/, '').trim();
}

function readChannel(): string | undefined {
  const link = document.querySelector<HTMLElement>(
    'ytd-watch-metadata ytd-channel-name a, #owner ytd-channel-name a, ytd-reel-video-renderer[is-active] ytd-channel-name a',
  );
  return link?.innerText.trim() || undefined;
}

function readDescription(): string {
  const element = document.querySelector<HTMLElement>(
    'ytd-watch-metadata #description-inline-expander, ytd-watch-metadata #description, #description-inline-expander',
  );
  return element?.innerText.slice(0, 600) ?? '';
}

/** Language data from youtube-main.content.ts. */
interface LanguageInfo {
  videoId: string;
  asr: string | null;
  audioDefault: string | null;
  captions: string[];
}

/**
 * Decide whether the video is in Japanese.
 * Automatic captions and the default audio track give the spoken language.
 * Without them, Japanese text in the title, channel or description counts.
 */
function japaneseVerdict(info: LanguageInfo | undefined, text: string): boolean | undefined {
  if (info?.asr) return info.asr.startsWith('ja');
  if (info?.audioDefault) return info.audioDefault.startsWith('ja');
  if (looksJapanese(text)) return true;
  if (info?.captions.some((language) => language.startsWith('ja'))) return true;
  return info ? false : undefined;
}

function findPlayerVideo(): HTMLVideoElement | null {
  return (
    document.querySelector<HTMLVideoElement>('#movie_player video.html5-main-video') ??
    document.querySelector<HTMLVideoElement>('ytd-reel-video-renderer[is-active] video') ??
    document.querySelector<HTMLVideoElement>('video.html5-main-video') ??
    document.querySelector<HTMLVideoElement>('video')
  );
}

function adShowing(): boolean {
  return Boolean(document.querySelector('#movie_player.ad-showing, .ad-showing .html5-video-player'));
}

export function startYouTubeTracker() {
  const core = new TrackerCore('youtube');
  const meter = new PlaybackMeter(core, () => !adShowing());
  let currentId: string | null = null;
  const languages = new Map<string, LanguageInfo>();

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data as (LanguageInfo & { source?: string }) | null;
    if (data?.source !== 'ntx-yt-language' || typeof data.videoId !== 'string') return;
    languages.set(data.videoId, {
      videoId: data.videoId,
      asr: typeof data.asr === 'string' ? data.asr : null,
      audioDefault: typeof data.audioDefault === 'string' ? data.audioDefault : null,
      captions: Array.isArray(data.captions) ? data.captions.filter((item) => typeof item === 'string') : [],
    });
    refresh();
  });

  const identityFor = (videoId: string) => {
    const title = readTitle();
    const channelName = readChannel();
    return {
      key: videoId,
      title,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      japanese: japaneseVerdict(languages.get(videoId), `${title}
${channelName ?? ''}
${readDescription()}`),
      meta: { videoId, channelName },
    };
  };

  function refresh() {
    const url = new URL(location.href);
    const videoId = readVideoId(url);
    if (videoId !== currentId) {
      currentId = videoId;
      if (videoId) window.postMessage({ source: 'ntx-yt-language-request' }, location.origin);
    }
    // The title, channel and language appear after navigation, so read them again on each pass.
    core.setIdentity(videoId ? identityFor(videoId) : null);
    meter.attach(videoId ? findPlayerVideo() : null);
    if (videoId) meter.updateState();
  }

  document.addEventListener('yt-navigate-finish', refresh);
  window.addEventListener('popstate', refresh);
  setInterval(refresh, 2_000);
  refresh();
  core.start();
}
