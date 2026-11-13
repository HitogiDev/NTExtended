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

  const refresh = () => {
    const url = new URL(location.href);
    const videoId = readVideoId(url);
    if (videoId !== currentId) {
      currentId = videoId;
      core.setIdentity(
        videoId
          ? {
              key: videoId,
              title: readTitle(),
              url: `https://www.youtube.com/watch?v=${videoId}`,
              meta: { videoId, channelName: readChannel() },
            }
          : null,
      );
    } else if (videoId) {
      // The title and channel appear after navigation, so refresh them later.
      core.setIdentity({
        key: videoId,
        title: readTitle(),
        url: `https://www.youtube.com/watch?v=${videoId}`,
        meta: { videoId, channelName: readChannel() },
      });
    }
    meter.attach(videoId ? findPlayerVideo() : null);
    if (videoId) meter.updateState();
  };

  document.addEventListener('yt-navigate-finish', refresh);
  window.addEventListener('popstate', refresh);
  setInterval(refresh, 2_000);
  refresh();
  core.start();
}
