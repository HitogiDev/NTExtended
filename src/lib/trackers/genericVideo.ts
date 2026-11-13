import { TrackerCore } from './core';
import { PlaybackMeter } from './playback';

/** Smaller videos are usually previews or ads. */
const MIN_WIDTH = 240;

function videoArea(video: HTMLVideoElement) {
  const rect = video.getBoundingClientRect();
  return rect.width * rect.height;
}

function pickVideo(): HTMLVideoElement | null {
  const videos = [...document.querySelectorAll('video')].filter((video) => {
    const rect = video.getBoundingClientRect();
    return rect.width >= MIN_WIDTH && !video.muted;
  });
  const playing = videos.filter((video) => !video.paused && !video.ended);
  const pool = playing.length > 0 ? playing : videos;
  return pool.sort((a, b) => videoArea(b) - videoArea(a))[0] ?? null;
}

/**
 * Track the main video of a page or frame.
 * The background replaces the key and title with the tab URL and title.
 */
export function startGenericVideoTracker() {
  const core = new TrackerCore('video');
  const meter = new PlaybackMeter(core);
  const frameKey = window === window.top ? 'top' : `frame:${location.origin}`;

  const refresh = () => {
    const video = pickVideo();
    if (video && meter.element !== video) {
      core.setIdentity({
        key: frameKey,
        title: document.title,
        url: location.href,
        meta: { site: location.hostname },
      });
    }
    meter.attach(video);
  };

  document.addEventListener('play', refresh, true);
  setInterval(refresh, 3_000);
  refresh();
  core.start();
}
