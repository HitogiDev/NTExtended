# NTExtended

A browser extension that tracks Japanese immersion for [NihongoTracker](https://nihongotracker.app).

It works in Chromium browsers (Chrome, Edge, Brave, Opera, Vivaldi) and Firefox from one code base, built with [WXT](https://wxt.dev), React, Tailwind CSS v4 and daisyUI v5. The UI uses the same themes, radii and media colors as NihongoTracker.

## What it tracks

| Source | How | Default log type |
| --- | --- | --- |
| YouTube | Real playback time of the main video. Pauses, seeks, buffering and ads do not count. Playback speed uses wall time. | `video`, linked to the channel |
| Ttsu Reader (`reader.ttsu.app`) and Yatsu Reader (`app.yatsu.moe`) | Characters from the reader counter (`explored / total`) and active reading time. Reading pauses after some minutes without a page turn. Large jumps in the book do not count. | `light-novel` |
| Any page (Wikipedia, news, blogs) | Manual timer from the popup. Counts the Japanese text of each paragraph after it appears on screen, the selected text, or only time. | `reading` |
| Streaming sites (Netflix, Crunchyroll, Prime Video, Disney+, HIDIVE, Bilibili, Niconico, ABEMA, TVer, U-NEXT, or any domain) | Playback time of the largest playing video, also inside player frames. Each site needs permission from Settings. | `anime`, `tv show` or `video`, by site |

Nothing is sent automatically. Each finished session becomes a draft in the popup. You can edit the type, media, title, time, characters, episodes, date and privacy, merge drafts, and then log them. Logs use a stable `Idempotency-Key`, so a retry never creates a second log. Private windows are not tracked.

A session finishes when you press Finish, close the tab, change the video or page, or after it stays paused for the configured time.

## Connect your account

- **Connect**: opens `/extension/connect` on NihongoTracker. Press Authorize there to create an API key named `NTExtended (<browser>)` and send it to the extension.
- **Paste a key**: create a key in NihongoTracker Settings, API keys, and paste it in the extension settings.

Revoke the key in NihongoTracker Settings to remove access. To use a local server, change the server URL in the extension settings (for example `http://localhost:5173` for the Vite dev server, which proxies the API).

## Development

Requirements: Node.js 20 or later.

```bash
npm install
npm run dev            # Chrome with hot reload
npm run dev:firefox    # Firefox with hot reload
npm run typecheck
npm run build          # .output/chrome-mv3
npm run build:firefox  # .output/firefox-mv3
npm run zip            # store package for Chromium browsers
npm run zip:firefox    # store package for Firefox, with sources
```

Load an unpacked build:

- Chrome or Edge: open `chrome://extensions`, turn on developer mode, select **Load unpacked**, and choose `.output/chrome-mv3`.
- Firefox: open `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**, and choose `.output/firefox-mv3/manifest.json`.

## Releases

GitHub Actions run the typecheck and both builds on every push to `main` and on pull requests (`.github/workflows/ci.yml`).

To publish a release, raise the version and push its tag:

```bash
npm version patch   # or minor / major: updates package.json and creates the tag
git push --follow-tags
```

The tag (`vX.Y.Z`) must match `version` in `package.json`. `.github/workflows/release.yml` then creates a GitHub release with the Chromium, Firefox and sources zips, and the release notes. A tag with a suffix, such as `v0.2.0-beta.1`, publishes a pre-release. To repeat a release for an existing tag, run the workflow manually and enter the tag.

## Structure

```
src/
  entrypoints/
    background.ts        sessions, drafts, API calls, badge, connection
    popup/               current sessions, tab timer, drafts, daily goals
    options/             account, tracking, streaming sites, appearance, server
    youtube.content.ts   YouTube tracker
    reader.content.ts    Ttsu and Yatsu tracker
    video.ts             streaming tracker, registered at runtime per allowed site
    article.ts           page timer, injected on demand
    connect.ts           bridge for the NihongoTracker connect page
  lib/
    trackers/            tracker core, playback meter and one module per source
    sessions.ts          session totals and draft creation
    api.ts               NihongoTracker API client
    storage.ts           typed extension storage
    i18n.ts              English and Spanish strings
  ui/                    shared React components
  styles.css             daisyUI themes and tokens copied from NihongoTracker
```

All state is kept in `storage.local`, because the browser can stop the background worker at any time. Trackers send cumulative counters every 15 seconds. The background adds the counters of each page instance, so reloads and player frames do not reset or repeat time.

## Known limits

- The Yatsu Reader selectors are not verified yet. The tracker looks for the same `explored / total` counter as Ttsu.
- Readers count characters only while their character counter is visible.
- The media search in the draft editor uses the media that NihongoTracker already knows.
