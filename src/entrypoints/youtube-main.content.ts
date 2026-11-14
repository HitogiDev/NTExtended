import { defineContentScript } from 'wxt/utils/define-content-script';

interface PlayerResponse {
  videoDetails?: { videoId?: string };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: Array<{ languageCode?: string; kind?: string }>;
    };
  };
  streamingData?: {
    adaptiveFormats?: Array<{ audioTrack?: { id?: string; audioIsDefault?: boolean } }>;
  };
}

/**
 * Read the spoken language of the current video from the YouTube player.
 * The isolated tracker cannot read page variables, so this script runs in the page world.
 * Automatic captions (kind "asr") use the spoken language.
 * Keep the message shape aligned with lib/trackers/youtube.ts.
 */
export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  world: 'MAIN',
  runAt: 'document_idle',
  main() {
    let lastSent = '';

    const read = () => {
      const player = document.getElementById('movie_player') as
        | (HTMLElement & { getPlayerResponse?: () => PlayerResponse })
        | null;
      const response =
        player?.getPlayerResponse?.() ??
        (window as unknown as { ytInitialPlayerResponse?: PlayerResponse }).ytInitialPlayerResponse;
      const videoId = response?.videoDetails?.videoId;
      if (!videoId) return;

      const tracks = response.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      const asr = tracks.find((track) => track.kind === 'asr')?.languageCode ?? null;
      const audioDefault =
        response.streamingData?.adaptiveFormats
          ?.map((format) => format.audioTrack)
          .find((track) => track?.audioIsDefault)
          ?.id?.split('.')[0] ?? null;
      const captions = tracks.map((track) => track.languageCode).filter(Boolean);

      const message = { source: 'ntx-yt-language', videoId, asr, audioDefault, captions };
      const serialized = JSON.stringify(message);
      if (serialized === lastSent) return;
      lastSent = serialized;
      window.postMessage(message, location.origin);
    };

    document.addEventListener('yt-navigate-finish', () => setTimeout(read, 500));
    window.addEventListener('message', (event) => {
      if (event.source === window && (event.data as { source?: string })?.source === 'ntx-yt-language-request') {
        lastSent = '';
        read();
      }
    });
    setInterval(read, 3_000);
    read();
  },
});
