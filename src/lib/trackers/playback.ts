import type { TrackerCore } from './core';

/** Largest gap between two time updates that still counts as continuous playback. */
const MAX_STEP_SECONDS = 2.5;

/**
 * Credit real watching time from a media element.
 * Seeks, buffering and skipped ads do not count. Speed changes use wall time.
 */
export class PlaybackMeter {
  private media: HTMLMediaElement | null = null;
  private lastTime = 0;
  private readonly onUpdate = () => this.tick();
  private readonly onState = () => this.updateState();
  private readonly onSeek = () => {
    if (this.media) this.lastTime = this.media.currentTime;
  };

  constructor(
    private readonly core: TrackerCore,
    private readonly shouldCount: (media: HTMLMediaElement) => boolean = () => true,
  ) {}

  get element() {
    return this.media;
  }

  attach(media: HTMLMediaElement | null) {
    if (media === this.media) return;
    this.detach();
    this.media = media;
    if (!media) {
      this.core.setActive(false);
      return;
    }
    this.lastTime = media.currentTime;
    media.addEventListener('timeupdate', this.onUpdate);
    media.addEventListener('seeking', this.onSeek);
    media.addEventListener('seeked', this.onSeek);
    for (const event of ['play', 'playing', 'pause', 'ended', 'waiting', 'emptied']) {
      media.addEventListener(event, this.onState);
    }
    this.updateState();
  }

  private detach() {
    const media = this.media;
    if (!media) return;
    media.removeEventListener('timeupdate', this.onUpdate);
    media.removeEventListener('seeking', this.onSeek);
    media.removeEventListener('seeked', this.onSeek);
    for (const event of ['play', 'playing', 'pause', 'ended', 'waiting', 'emptied']) {
      media.removeEventListener(event, this.onState);
    }
  }

  isPlaying() {
    const media = this.media;
    return Boolean(media && !media.paused && !media.ended && media.readyState > 2);
  }

  updateState() {
    const media = this.media;
    this.core.setActive(Boolean(media && this.isPlaying() && this.shouldCount(media)));
    if (media) this.lastTime = media.currentTime;
  }

  private tick() {
    const media = this.media;
    if (!media) return;
    const delta = media.currentTime - this.lastTime;
    this.lastTime = media.currentTime;
    const rate = media.playbackRate || 1;
    if (!this.isPlaying() || !this.shouldCount(media)) {
      this.core.setActive(false);
      return;
    }
    this.core.setActive(true);
    if (delta > 0 && delta <= MAX_STEP_SECONDS * rate) this.core.addSeconds(delta / rate);
  }
}
