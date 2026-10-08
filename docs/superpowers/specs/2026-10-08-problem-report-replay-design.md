# Problem-report replay — design

**Date:** 2026-10-08
**Status:** Awaiting review

## Goal

A visitor to martilama.com who hits something broken can click "report a
problem" in the footer and send a replay of roughly their last 3 minutes on the
site — DOM changes, mouse, scroll, navigation — together with the console
output from the same period. Marti watches the replay on a separate, private
site, `reports.martilama.com`.

Priorities, in order:

1. **The end of the recording is exact.** It ends on the click of the
   "report a problem" link and contains everything up to that instant.
2. **The start is loose.** At least 3 minutes when the visitor has been on the
   site that long; up to ~30 s more is fine.
3. **Idle time is recorded faithfully**, not skipped or collapsed.
4. **Practical over hand-built.** Capture and replay use `rrweb`; this project
   only owns the buffer, the upload, and the viewer.

Nothing leaves the visitor's browser, and nothing is written to disk, until
they press Send.

## Non-goals

- Surviving a hard refresh or tab close (buffer is in memory only). Persisting
  to IndexedDB can be added later without changing the Worker or viewer.
- Notifications of new reports — Marti checks the dashboard.
- Shareable report links, Turnstile, network-request capture, video capture.

## Architecture

```
martilama.com (static, existing)            reports.martilama.com (new Worker)
┌──────────────────────────────┐            ┌─────────────────────────────────┐
│ vendor/rrweb record + console│            │ POST /ingest      (public)      │
│ report-buffer.js  (pure)     │  gzip POST │ GET  /            (Access) list │
│ report.js  (recorder+dialog) ├───────────▶│ GET  /r/:id       (Access) view │
│ Footer.js  (link + <dialog>) │            │ GET  /api/reports/:id/events    │
└──────────────────────────────┘            │ DELETE /api/reports/:id         │
                                            │            │                    │
                                            │            ▼   R2 bucket        │
                                            │   reports/<id>/meta.json        │
                                            │   reports/<id>/events.json.gz   │
                                            └─────────────────────────────────┘
```

Both halves live in this repo. The site half is deployed by the existing
push-to-`main` build. The Worker lives in `reports/` with its own
`package.json` and `wrangler.toml` and is deployed with `npx wrangler deploy`.

## Site side

### Files

| File | Purpose |
|---|---|
| `public/js/vendor/rrweb-record.min.js` | `@rrweb/record` 2.1.7 UMD build, vendored, version pinned in a header comment |
| `public/js/vendor/rrweb-console-record.min.js` | `@rrweb/rrweb-plugin-console-record` 2.1.7 UMD build |
| `public/js/report-buffer.js` | Pure buffer logic, no DOM or rrweb dependency |
| `public/js/report.js` | Starts the recorder, owns the dialog and the upload |
| `components/Footer.js` | Adds the link and the `<dialog>` markup |
| `layouts/BaseLayout.js` | Adds the four script tags |
| `styles/` | Dialog styles using the existing theme variables |
| `public/_headers` | CORS for `/fonts/*` (see Viewer) |

Measured weight added to every page: 23.7 KB gzipped for the recorder and
3.3 KB for the console plugin, about 27 KB gzipped in total (77 KB + 8 KB
raw). The record-only package is used rather than full `rrweb`, which is
82.8 KB gzipped because it bundles the replayer.

The scripts are classic (non-module) and placed at the end of `<body>`
**before** `theme.js`, `progress.js`, `clock.js` and `router.js`, so console
output from those scripts is captured.

### Recorder

`report.js` starts recording on load with:

- `checkoutEveryNms: 30000` — a fresh full snapshot at most every 30 s.
- `maskAllInputs: true`.
- The console plugin, capturing `log`, `info`, `warn`, `error`, `debug`,
  uncaught errors and unhandled promise rejections. Console entries are
  ordinary events in the same stream as DOM events, so they are already
  time-aligned.
- Finer mouse sampling than the default (movement sampled every ~20 ms,
  flushed every ~100 ms).
- The dialog carries rrweb's block class so it never appears in a recording.

Because `router.js` swaps only `<main>`, the recorder survives navigation and
a recording spans pages. Each navigation appears as a DOM mutation plus a
custom `navigate` event carrying the new path, emitted on `page:load`.

### Buffer (`report-buffer.js`)

A pure module exposing `globalThis.ReportBuffer`, so the same file runs as a
classic script in the browser and is imported directly by `node:test`.

- `push(event, isCheckout)` — a checkout starts a new segment.
- After each push, drop the oldest segment while the **second**-oldest segment
  starts at or before `now − 180 s`. The buffer therefore always reaches back
  at least 3 minutes when that much history exists.
- `freeze(markerTime)` — returns a flat copy of all events up to `markerTime`.
  rrweb emits mouse movement in batches stamped with the flush time and
  per-position negative offsets, so a batch flushed after the marker is kept
  but trimmed to the positions that happened at or before it.

### Idle time

Idle time is part of what the visitor did and is recorded and replayed as
such: a visitor who read for two minutes without touching anything produces a
replay with two real minutes of stillness in it.

rrweb on its own only takes a checkout when an event arrives, so an idle page
would produce no new segments and the buffer would stop rotating. `report.js`
therefore drives checkouts from a clock:

- Every 30 s a timer calls `record.takeFullSnapshot(true)` if no checkout has
  happened in the last 30 s. The buffer rotates on schedule whether or not
  anything is happening, so the 3:00–3:30 bound holds for idle visitors too.
- Browsers throttle timers in background tabs (to about once a minute), so on
  `visibilitychange` the recorder emits a custom `tab-hidden` or `tab-visible`
  event, and takes a snapshot immediately on becoming visible. While the tab
  is hidden the start of the recording can be up to about a minute further
  back; nothing is lost.
- The `tab-hidden` / `tab-visible` events let the viewer tell "sat reading"
  apart from "was in another tab".

### Report flow

1. Visitor clicks "report a problem". The click handler immediately emits a
   custom `report-click` event — this is the end marker — then opens the
   dialog.
2. 600 ms later, while the dialog is open, `report.js` calls
   `freeze(markerTime)` and holds the result. The delay lets rrweb flush its
   batched mouse and mutation events from before the click.
3. The dialog shows one sentence — "This sends a replay of about your last
   3 minutes on this site, and the browser console log, to Marti." — an
   optional note (max 1000 characters), Send and Cancel.
4. **Send:** build `{ version: 1, events }`, gzip with `CompressionStream`
   (uncompressed if unavailable), and POST as `multipart/form-data` to
   `https://reports.martilama.com/ingest` with two parts: `meta` (JSON: note,
   page URL, viewport, user agent, start and end timestamps, encoding) and
   `events` (the blob). If Send is pressed inside the 600 ms window it waits
   for the freeze first.
5. **Cancel:** discard the frozen copy. Recording was never paused.

### Failure handling

- The link is rendered with `hidden` and revealed by `report.js` only after
  the recorder has started. If rrweb fails to load or throws, the site works
  as before and there is no link.
- Upload failure: the dialog keeps the frozen copy and the note, shows a plain
  message, and offers Retry.
- A 413 or 429 from the Worker gets its own short message (too large / try
  again in a minute).

## Reports Worker (`reports/`)

### Ingest — `POST /ingest` (public)

- CORS: allows only `Origin: https://martilama.com`; answers the preflight.
- Rejects bodies over 5 MB (413), checked on `Content-Length` and enforced
  while reading.
- Rate limit of 5 per minute per IP via the Workers Rate Limiting binding
  (429). The IP is used for the limit only and is never stored.
- Validates `meta`: note ≤ 1000 characters, page URL on the `martilama.com`
  origin, numeric viewport and timestamps. The events blob is stored as-is and
  never parsed by the Worker.
- Writes `reports/<id>/meta.json` and `reports/<id>/events.json.gz`, where
  `<id>` is an inverted millisecond timestamp plus a random suffix, so R2's
  lexicographic listing returns newest first.
- Returns `201 { id }`.

### Storage

One R2 bucket. A lifecycle rule deletes objects under `reports/` after
30 days. No database.

### Viewer (behind Cloudflare Access)

- `GET /` — the 50 newest reports: date, page, note, duration.
- `GET /r/:id` — `rrweb-player` on the left; on the right a console panel
  built from the console events, which follows playback, highlights warnings
  and errors, and seeks the replay when a line is clicked. Shows the note,
  page, viewport and user agent, and a Delete button.
- The player runs with `skipInactive: false` (its default is to skip), so
  idle stretches play in real time. The speed control remains for
  fast-forwarding by hand. Navigations and tab hidden/visible moments appear
  as entries in the side panel alongside console lines.
- `GET /api/reports/:id/events` — streams the stored blob with the matching
  `Content-Encoding`.
- `DELETE /api/reports/:id` — removes both objects.
- `rrweb-player` 2.1.7 is vendored into `reports/public/` and served as
  static assets.

### Security

- Access protects the whole hostname; a second Access application with a
  Bypass policy covers only `/ingest`. The viewer and its API sit on different
  paths from ingest so the bypass cannot expose them.
- The Worker independently verifies the `Cf-Access-Jwt-Assertion` token
  (team domain and audience from environment variables) on every route except
  `/ingest`, so a misconfigured Access policy fails closed.
- Uploads are untrusted input. The note and metadata are HTML-escaped; the
  replay runs in rrweb's sandboxed iframe; viewer pages send a restrictive
  Content-Security-Policy that allows images, fonts and styles from
  `https://martilama.com` only.

### Fonts in replays

Replays reference the site's fonts and images by URL. Fonts need CORS, so the
site adds to `public/_headers`:

```
/fonts/*
  Access-Control-Allow-Origin: https://reports.martilama.com
```

## Manual Cloudflare setup (Marti)

1. Create the R2 bucket and its 30-day lifecycle rule.
2. Attach `reports.martilama.com` as the Worker's custom domain.
3. Create the Access application for the hostname (allow: Marti's login) and
   the Bypass application for `/ingest`.
4. Set the Access team domain and audience as Worker variables.

## Testing

- `test/report-buffer.test.mjs` — segment rotation (including clock-driven
  checkouts with no events in between), the 3-minute floor,
  freeze at the marker, trimming of mouse batches that straddle the marker.
- `reports/test/*.test.mjs` — origin check, size cap, rate limit, meta
  validation, storage keys, Access token verification, list ordering, delete.
  The Worker uses only web-standard `Request`/`Response`/WebCrypto, so tests
  run under plain `node:test` on Node 22 with an in-memory R2 stand-in.
- By hand in Zen and Chromium: browse for 4 minutes across several pages, log
  to the console, click "report a problem", send. Confirm the replay ends on
  that click, covers at least 3 minutes, and the console panel lines up.
- By hand, idle case: load a page, do nothing for 4 minutes, report. Confirm
  the replay is 3:00–3:30 of stillness played in real time. Repeat with the
  tab in the background for part of the wait and confirm the hidden/visible
  entries appear.

## Open point

The footer currently says "no framework, no trackers, no cookies". This
feature sets no cookies and sends nothing without an explicit Send, but it
does record activity in memory on every page view. Marti to decide whether the
footer line stays as is.
