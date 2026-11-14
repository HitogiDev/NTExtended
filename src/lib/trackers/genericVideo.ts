import { looksJapanese } from '../japanese';
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

function hasJapaneseTrack(video: HTMLVideoElement): boolean {
  const audio = (video as HTMLVideoElement & { audioTracks?: ArrayLike<{ language: string; enabled: boolean }> })
    .audioTracks;
  if (audio) {
    for (let index = 0; index < audio.length; index += 1) {
      const track = audio[index];
      if (track?.enabled && track.language.startsWith('ja')) return true;
    }
  }
  for (const track of video.textTracks) {
    if (track.mode !== 'disabled' && track.language.startsWith('ja')) return true;
  }
  return false;
}

/**
 * Look for signs of Japanese content in this frame.
 * Return undefined without a sign. The background also checks the tab title.
 */
function japaneseVerdict(video: HTMLVideoElement | null): boolean | undefined {
  if (document.documentElement.lang.toLowerCase().startsWith('ja')) return true;
  if (looksJapanese(document.title)) return true;
  if (video && hasJapaneseTrack(video)) return true;
  return undefined;
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
    if (video) {
      core.setIdentity({
        key: frameKey,
        title: document.title,
        url: location.href,
        japanese: japaneseVerdict(video),
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
