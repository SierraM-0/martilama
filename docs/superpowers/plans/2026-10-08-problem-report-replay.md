# Problem-Report Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A footer "report a problem" link on martilama.com that uploads a replay of the visitor's last ~3 minutes (DOM + console), ending exactly on that click, to a private viewer at `reports.martilama.com`.

**Architecture:** The static site loads a vendored rrweb recorder that feeds a rolling in-memory buffer; on click the buffer is frozen at a marker event and POSTed, gzipped, to a Cloudflare Worker. The Worker (in `reports/`) stores each report as two R2 objects and serves an Access-gated viewer built on a vendored `rrweb-player`.

**Tech Stack:** Plain browser JS (classic scripts, no bundler), `@rrweb/record` 2.1.7, `@rrweb/rrweb-plugin-console-record` 2.1.7, `rrweb-player` 2.1.7, Cloudflare Workers + R2 + Access + Workers Rate Limiting, `wrangler`, `node:test` on Node 22.

**Spec:** `docs/superpowers/specs/2026-10-08-problem-report-replay-design.md`

## Global Constraints

- Work on branch `problem-report-replay`. Never push to `main` (push to `main` deploys the site).
- Nothing leaves the browser and nothing is written to disk until Send is pressed.
- The recording ends on the click of the "report a problem" link; the dialog never appears in a recording.
- The buffer always reaches back at least 180 s when that much history exists; checkouts every 30 s, driven by a clock so idle visitors are covered.
- Idle time is replayed in real time: the player runs with `skipInactive: false`.
- rrweb packages are vendored at exactly 2.1.7. No CDN, no bundler, no new root `dependencies`.
- Site scripts are classic (non-module) scripts. The recorder scripts load before `theme.js`.
- Dialog sentence, verbatim: "This sends a replay of about your last 3 minutes on this site, and the browser console log, to Marti."
- Note max 1000 characters. Upload max 5 MB. Rate limit 5 per minute per IP. The visitor IP is never stored.
- Public upload path is `/ingest`. Every other Worker route requires a valid Cloudflare Access token and fails closed.
- R2 keys: `reports/<id>/meta.json` and `reports/<id>/events.json.gz`, `<id>` = 13-digit inverted millisecond timestamp + `-` + 8 hex characters.
- If rrweb fails to load or throws, the site works as before and the footer link stays hidden.
- Tests use `node:test` + `node:assert/strict`, files named `*.test.mjs`, matching `test/`.
- End every commit message with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

1. **Report clicked seconds after arriving** — less than 3 minutes of history exists; the visitor expects the report to send with whatever there is. (Task 1 test "short session".)
2. **Cancel, keep browsing, report again** — the second report must end at the second click, not the first. (Task 1 test "second freeze uses the later marker".)
3. **Upload whose real size exceeds its declared size** — missing or understated `Content-Length`; the Worker must still stop at 5 MB and answer 413, not buffer without limit. (Task 4 test "oversized body without Content-Length".)
4. **Malformed upload** — missing parts, non-JSON `meta`, body that is not multipart; the Worker answers 400, never 500. (Task 4 tests "malformed".)
5. **Opening a report that no longer exists** — expired by the 30-day rule or deleted in another tab; the viewer shows a 404 page and the list skips broken entries rather than erroring. (Task 6 tests "missing report".)

## File Structure

Site (existing repo root):

| File | Responsibility |
|---|---|
| `public/js/report-buffer.js` (new) | Pure rolling buffer: segments, 3-minute floor, freeze at marker |
| `public/js/report.js` (new) | Start rrweb, clock-driven checkouts, dialog, upload |
| `public/js/vendor/rrweb-record.min.js` (new) | Vendored recorder |
| `public/js/vendor/rrweb-console-record.min.js` (new) | Vendored console plugin |
| `components/Footer.js` (modify) | Link + `<dialog>` markup |
| `layouts/BaseLayout.js` (modify) | Four script tags |
| `styles/global.css` (modify) | Link + dialog styles |
| `build.js` (modify) | Include new scripts in the asset hash |
| `public/_headers` (new) | CORS for `/fonts/*` |
| `test/report-buffer.test.mjs`, `test/report-markup.test.mjs` (new) | Tests |

Worker (`reports/`, all new):

| File | Responsibility |
|---|---|
| `package.json`, `wrangler.toml`, `.dev.vars.example` | Project + bindings |
| `src/index.js` | Route: `/ingest` public, everything else behind Access |
| `src/ingest.js` | CORS, size cap, rate limit, validation, storage |
| `src/access.js` | Verify the Cloudflare Access JWT |
| `src/html.js` | Escaping, formatting, HTML response with CSP |
| `src/viewer.js` | List page, report page, events API, delete |
| `public/entries.js` | Pure: rrweb events → side-panel entries |
| `public/viewer.js`, `public/viewer.css` | Player + synced panel |
| `public/vendor/rrweb-player.min.{js,css}` | Vendored player |
| `testing/fakes.mjs` | In-memory R2 stand-in (outside `test/` so `node --test` does not run it as a test file) |
| `test/*.test.mjs` | Tests |

rrweb facts this plan relies on (verified against the 2.1.7 bundles):

- Globals: `rrwebRecord.record`, `record.addCustomEvent(tag, payload)`, `record.takeFullSnapshot(isCheckout)`, `rrwebPluginConsoleRecord.getRecordConsolePlugin(opts)`, `rrwebPlayer.default`.
- `record()` does not start until `DOMContentLoaded` (with `recordAfter: 'DOMContentLoaded'`; the default is `load`). `addCustomEvent` and `takeFullSnapshot` throw before that.
- Event types: 2 FullSnapshot, 3 IncrementalSnapshot, 4 Meta, 5 Custom (`data.tag`, `data.payload`), 6 Plugin (`data.plugin`, `data.payload`).
- Every full snapshot is preceded by a Meta event. Mouse/touch/drag movement is `type 3` with `data.source` 1, 6 or 12 and `data.positions[]`, each with a negative `timeOffset` relative to the event's `timestamp` (the flush time).
- Console plugin events: `data.plugin === 'rrweb/console@1'`, `data.payload = { level, trace, payload: string[] }` where each string is a JSON-stringified argument.

---

### Task 1: Rolling buffer

**Files:**
- Create: `public/js/report-buffer.js`
- Test: `test/report-buffer.test.mjs`

**Interfaces:**
- Produces: `globalThis.ReportBuffer.create({ windowMs = 180000 } = {})` returning `{ push(event), freeze(markerTime) → event[], lastCheckoutAt() → number, segmentCount() → number }`. `push` starts a new segment on any event with `type === 4`. `freeze` returns a new array and never mutates the buffer.

- [ ] **Step 1: Write the failing tests**

`test/report-buffer.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/report-buffer.js';

const { create } = globalThis.ReportBuffer;

const meta = (t) => ({ type: 4, timestamp: t, data: {} });
const full = (t) => ({ type: 2, timestamp: t, data: {} });
const inc = (t) => ({ type: 3, timestamp: t, data: { source: 2 } });
const move = (t, offsets) => ({
  type: 3,
  timestamp: t,
  data: { source: 1, positions: offsets.map((o, i) => ({ x: i, y: i, id: 1, timeOffset: o })) },
});
const checkout = (buf, t) => { buf.push(meta(t)); buf.push(full(t)); };

test('a Meta event starts a new segment', () => {
  const buf = create();
  checkout(buf, 0);
  buf.push(inc(10));
  checkout(buf, 30000);
  assert.equal(buf.segmentCount(), 2);
  assert.equal(buf.lastCheckoutAt(), 30000);
});

test('clock-driven checkouts with no events between keep 180–210 s', () => {
  const buf = create();
  for (let t = 0; t <= 600000; t += 30000) {
    checkout(buf, t);
    if (t < 180000) continue;
    for (const end of [t, t + 29999]) {
      const events = buf.freeze(end);
      const span = end - events[0].timestamp;
      assert.ok(span >= 180000 && span < 210000, `span ${span} at end ${end}`);
      assert.equal(events[0].type, 4);
    }
  }
});

test('short session: freeze returns everything there is', () => {
  const buf = create();
  checkout(buf, 0);
  buf.push(inc(5000));
  assert.deepEqual(buf.freeze(6000).map((e) => e.timestamp), [0, 0, 5000]);
});

test('freeze drops events after the marker', () => {
  const buf = create();
  checkout(buf, 0);
  buf.push(inc(1000));
  buf.push(inc(2000));
  assert.deepEqual(buf.freeze(1500).map((e) => e.timestamp), [0, 0, 1000]);
});

test('a move batch straddling the marker is trimmed and re-stamped', () => {
  const buf = create();
  checkout(buf, 0);
  buf.push(move(1100, [-300, -200, -50])); // positions at 800, 900, 1050
  const last = buf.freeze(1000).at(-1);
  assert.equal(last.timestamp, 1000);
  assert.deepEqual(last.data.positions.map((p) => p.timeOffset), [-200, -100]);
  assert.deepEqual(last.data.positions.map((p) => p.x), [0, 1]);
});

test('a move batch wholly after the marker is dropped', () => {
  const buf = create();
  checkout(buf, 0);
  buf.push(move(1500, [-100, -50]));
  assert.equal(buf.freeze(1000).length, 2);
});

test('a segment that started after the marker is ignored', () => {
  const buf = create();
  checkout(buf, 0);
  buf.push(inc(900));
  checkout(buf, 1200);
  assert.deepEqual(buf.freeze(1000).map((e) => e.timestamp), [0, 0, 900]);
});

test('freeze does not mutate; second freeze uses the later marker', () => {
  const buf = create();
  checkout(buf, 0);
  const original = move(1100, [-300, -50]);
  buf.push(original);
  buf.freeze(1000);
  assert.equal(original.timestamp, 1100);
  assert.equal(original.data.positions.length, 2);
  buf.push(inc(5000));
  assert.deepEqual(buf.freeze(6000).map((e) => e.timestamp), [0, 0, 1100, 5000]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/report-buffer.test.mjs`
Expected: FAIL — cannot find module `public/js/report-buffer.js`.

- [ ] **Step 3: Implement**

`public/js/report-buffer.js`:

```js
// Rolling buffer of rrweb events for the problem-report feature. Pure logic:
// no DOM, no rrweb. Runs as a classic script in the browser and is imported
// directly by node:test, so it attaches to globalThis instead of exporting.
//
// Events are grouped into segments, each beginning at a Meta event (rrweb
// emits one before every full snapshot). A replay can only start at a full
// snapshot, so whole segments are dropped — never individual events.
(function (g) {
  const META = 4;
  const INCREMENTAL = 3;
  const MOVE_SOURCES = [1, 6, 12]; // MouseMove, TouchMove, Drag

  function create({ windowMs = 180000 } = {}) {
    const segments = []; // { start, events }

    function push(event) {
      if (event.type === META || segments.length === 0) {
        segments.push({ start: event.timestamp, events: [] });
      }
      segments[segments.length - 1].events.push(event);
      // Drop the oldest segment only while the next one still reaches back
      // past the window, so at least windowMs of history always remains.
      const floor = event.timestamp - windowMs;
      while (segments.length > 1 && segments[1].start <= floor) segments.shift();
    }

    function freeze(markerTime) {
      const out = [];
      for (const seg of segments) {
        for (const ev of seg.events) {
          const kept = trim(ev, markerTime);
          if (kept) out.push(kept);
        }
      }
      return out;
    }

    return {
      push,
      freeze,
      lastCheckoutAt: () => (segments.length ? segments[segments.length - 1].start : 0),
      segmentCount: () => segments.length,
    };
  }

  // Movement is emitted in batches stamped with the flush time, each position
  // carrying a negative offset. A batch flushed after the marker can still
  // hold positions from before it; keep those and re-stamp the batch.
  function trim(ev, markerTime) {
    if (ev.timestamp <= markerTime) return ev;
    const d = ev.data;
    const isMove = ev.type === INCREMENTAL && d && MOVE_SOURCES.includes(d.source)
      && Array.isArray(d.positions);
    if (!isMove) return null;
    const shift = ev.timestamp - markerTime;
    const positions = d.positions
      .filter((p) => ev.timestamp + p.timeOffset <= markerTime)
      .map((p) => ({ ...p, timeOffset: p.timeOffset + shift }));
    if (positions.length === 0) return null;
    return { ...ev, timestamp: markerTime, data: { ...d, positions } };
  }

  g.ReportBuffer = { create };
})(globalThis);
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/report-buffer.test.mjs`
Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add public/js/report-buffer.js test/report-buffer.test.mjs
git commit -m "Add rolling rrweb event buffer for problem reports"
```

---

### Task 2: Vendor rrweb, footer markup, layout, styles

**Files:**
- Create: `public/js/vendor/rrweb-record.min.js`, `public/js/vendor/rrweb-console-record.min.js`, `public/_headers`
- Modify: `components/Footer.js`, `layouts/BaseLayout.js`, `styles/global.css`, `build.js`
- Test: `test/report-markup.test.mjs`

**Interfaces:**
- Produces (DOM ids used by Task 3): `#report-slot` (wrapper, `hidden`), `#report-link` (button), `#report-dialog` (`<dialog class="report-dialog rr-block">`), `#report-form`, `#report-note` (textarea), `#report-status`, `#report-cancel`, `#report-send`.
- Produces: script load order `vendor/rrweb-record.min.js`, `vendor/rrweb-console-record.min.js`, `report-buffer.js`, `report.js`, then the existing four.

- [ ] **Step 1: Write the failing test**

`test/report-markup.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Footer } from '../components/Footer.js';
import { BaseLayout } from '../layouts/BaseLayout.js';

test('footer carries a hidden report link and a blocked dialog', () => {
  const out = Footer();
  assert.match(out, /<span id="report-slot" hidden>/);
  assert.match(out, /<button type="button" class="report-link" id="report-link">report a problem<\/button>/);
  assert.match(out, /<dialog id="report-dialog" class="report-dialog rr-block"/);
  assert.match(out, /<textarea id="report-note"[^>]*maxlength="1000"/);
  assert.ok(out.includes(
    'This sends a replay of about your last 3 minutes on this site, and the browser console log, to Marti.',
  ));
  for (const id of ['report-form', 'report-status', 'report-cancel', 'report-send']) {
    assert.ok(out.includes(`id="${id}"`), id);
  }
});

test('recorder scripts load before every other script, in order', () => {
  const out = BaseLayout({ title: 't', url: 'https://martilama.com/', body: '' });
  const order = [
    '/js/vendor/rrweb-record.min.js',
    '/js/vendor/rrweb-console-record.min.js',
    '/js/report-buffer.js',
    '/js/report.js',
    '/js/theme.js',
    '/js/router.js',
  ].map((src) => out.indexOf(`<script src="${src}`));
  assert.ok(order.every((i) => i > 0), `missing script: ${order}`);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/report-markup.test.mjs`
Expected: both tests FAIL (no `report-slot`, no vendor scripts).

- [ ] **Step 3: Vendor the two rrweb bundles**

```bash
mkdir -p public/js/vendor
tmp=$(mktemp -d)
npm pack @rrweb/record@2.1.7 @rrweb/rrweb-plugin-console-record@2.1.7 --pack-destination "$tmp" --silent
mkdir "$tmp/record" "$tmp/console"
tar -xzf "$tmp/rrweb-record-2.1.7.tgz" -C "$tmp/record"
tar -xzf "$tmp/rrweb-rrweb-plugin-console-record-2.1.7.tgz" -C "$tmp/console"
{ echo '/*! @rrweb/record 2.1.7 (MIT) — vendored, do not edit */'
  grep -v '^//# sourceMappingURL' "$tmp/record/package/dist/record.umd.min.cjs"
} > public/js/vendor/rrweb-record.min.js
{ echo '/*! @rrweb/rrweb-plugin-console-record 2.1.7 (MIT) — vendored, do not edit */'
  grep -v '^//# sourceMappingURL' "$tmp/console/package/dist/rrweb-plugin-console-record.umd.min.cjs"
} > public/js/vendor/rrweb-console-record.min.js
rm -rf "$tmp"
grep -c 'rrwebRecord' public/js/vendor/rrweb-record.min.js
grep -c 'rrwebPluginConsoleRecord' public/js/vendor/rrweb-console-record.min.js
```

Expected: both `grep -c` lines print a number ≥ 1.

- [ ] **Step 4: Add the footer markup**

In `components/Footer.js`, replace the `coloph-meta` paragraph and add the dialog after `.coloph-text`:

```js
        <p class="coloph-meta"><span>© ${year} martilama</span> · <span>updated ${updated}</span> ·
          <a href="https://github.com/SierraM-0" target="_blank" rel="noopener noreferrer">github</a><span id="report-slot" hidden> ·
          <button type="button" class="report-link" id="report-link">report a problem</button></span></p>
      </div>
      <dialog id="report-dialog" class="report-dialog rr-block" aria-labelledby="report-title">
        <form method="dialog" id="report-form">
          <h2 id="report-title">Report a problem</h2>
          <p>This sends a replay of about your last 3 minutes on this site, and the browser console log, to Marti.</p>
          <label for="report-note">What went wrong? (optional)</label>
          <textarea id="report-note" maxlength="1000" rows="4"></textarea>
          <p class="report-status" id="report-status" role="status" aria-live="polite"></p>
          <div class="report-actions">
            <button type="button" id="report-cancel">Cancel</button>
            <button type="submit" class="primary" id="report-send">Send</button>
          </div>
        </form>
      </dialog>
    </footer>`;
```

(The closing `</div>` shown is the existing end of `.coloph-text`; the dialog sits between it and `</footer>`.)

- [ ] **Step 5: Add the script tags**

In `layouts/BaseLayout.js`, immediately before `<script src="/js/theme.js${v}"></script>`:

```js
    <script src="/js/vendor/rrweb-record.min.js${v}"></script>
    <script src="/js/vendor/rrweb-console-record.min.js${v}"></script>
    <script src="/js/report-buffer.js${v}"></script>
    <script src="/js/report.js${v}"></script>
```

- [ ] **Step 6: Include the new scripts in the asset hash**

In `build.js`, change the `jsNames` line to:

```js
  const jsNames = ['theme', 'progress', 'clock', 'router', 'report-buffer', 'report',
    'vendor/rrweb-record.min', 'vendor/rrweb-console-record.min'];
```

`report.js` does not exist until Task 3; create an empty placeholder now so the build runs: `: > public/js/report.js`.

- [ ] **Step 7: Add styles**

Append to `styles/global.css`:

```css
/* ---- problem report ---- */
.report-link {
  font: inherit; color: var(--muted); background: none; border: 0; padding: 0; cursor: pointer;
}
.report-link:hover { color: var(--accent); }
#report-slot[hidden] { display: none; }
.report-dialog {
  width: min(28rem, calc(100vw - 2rem));
  padding: 1.5rem;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  text-align: left;
}
.report-dialog::backdrop { background: rgb(0 0 0 / 0.45); }
.report-dialog h2 { margin: 0 0 0.5rem; font-size: 1.2rem; }
.report-dialog p { margin: 0 0 1rem; color: var(--muted); font-size: 0.95rem; }
.report-dialog label { display: block; margin-bottom: 0.35rem; font-size: 0.9rem; }
.report-dialog textarea {
  width: 100%; box-sizing: border-box; padding: 0.6rem; font: inherit;
  color: var(--text); background: transparent;
  border: 1px solid var(--border); border-radius: 6px; resize: vertical;
}
.report-dialog .report-status { min-height: 1.4em; margin: 0.75rem 0 0; }
.report-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1rem; }
.report-actions button {
  font: inherit; padding: 0.45rem 1rem; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--border); background: transparent; color: var(--text);
}
.report-actions .primary { background: var(--accent); border-color: var(--accent); color: var(--bg); }
.report-actions button:disabled { opacity: 0.6; cursor: default; }
```

- [ ] **Step 8: Add the fonts CORS header**

`public/_headers`:

```
/fonts/*
  Access-Control-Allow-Origin: https://reports.martilama.com
```

- [ ] **Step 9: Run tests and build**

Run: `node --test test/ && npm run build && ls dist/_headers dist/js/vendor/`
Expected: all tests pass; build prints `Built … pages`; both vendor files and `_headers` are in `dist/`.

- [ ] **Step 10: Commit**

```bash
git add public/js/vendor public/js/report.js public/_headers components/Footer.js layouts/BaseLayout.js styles/global.css build.js test/report-markup.test.mjs
git commit -m "Vendor rrweb recorder; add report link, dialog markup and styles"
```

---

### Task 3: Recorder, dialog and upload (`report.js`)

**Files:**
- Modify: `public/js/report.js` (replace the empty placeholder)

**Interfaces:**
- Consumes: `globalThis.ReportBuffer.create()` (Task 1); DOM ids from Task 2; globals `rrwebRecord`, `rrwebPluginConsoleRecord`.
- Produces (wire format consumed by Task 4): `POST {ENDPOINT}` as `multipart/form-data` with part `meta` — a JSON string `{ version: 1, note, url, viewport: { width, height }, userAgent, startedAt, endedAt, encoding: 'gzip' | 'identity' }` — and part `events` — a blob of `{"version":1,"events":[…]}`, gzipped when `encoding` is `gzip`. Success is HTTP 201.
- Produces (custom rrweb events consumed by Task 7): tags `report-click` `{}`, `navigate` `{ path }`, `tab-hidden` `{}`, `tab-visible` `{}`, `early-console` `{ level, time, args: string[] }`.

This file is browser-only glue; its logic lives in Task 1 and is tested there. It is verified by hand in Step 2 and end to end in Task 8.

- [ ] **Step 1: Write `public/js/report.js`**

```js
// Problem-report recorder. Feeds rrweb events into a rolling in-memory buffer
// (report-buffer.js) and, when the visitor clicks "report a problem", uploads
// everything up to that click. Nothing is sent or stored until Send is
// pressed. If anything here fails, the site carries on and the footer link
// stays hidden.
(function () {
  const slot = document.getElementById('report-slot');
  const link = document.getElementById('report-link');
  const dialog = document.getElementById('report-dialog');
  if (!slot || !link || !dialog || !window.rrwebRecord || !window.ReportBuffer) return;
  if (typeof dialog.showModal !== 'function') return;

  const ENDPOINT = location.hostname === 'localhost'
    ? 'http://localhost:8787/ingest'
    : 'https://reports.martilama.com/ingest';
  const CHECKOUT_MS = 30000;
  // rrweb batches mouse movement (flushed every 100ms below) and mutations;
  // wait this long after the click before freezing so the tail is complete.
  const FLUSH_MS = 600;
  const LEVELS = ['log', 'info', 'warn', 'error', 'debug'];

  const { record } = window.rrwebRecord;
  const buffer = window.ReportBuffer.create();
  let started = false;
  let markerTime = 0;

  // rrweb does not start until DOMContentLoaded. Hold console output from
  // before that and replay it into the stream once recording is live.
  const early = [];
  for (const level of LEVELS) {
    const orig = console[level];
    console[level] = function (...args) {
      if (!started) early.push({ level, time: Date.now(), args: args.map(String) });
      return orig.apply(this, args);
    };
  }

  const custom = (tag, payload) => {
    try { record.addCustomEvent(tag, payload); } catch { /* not recording yet */ }
  };
  const snapshot = () => {
    try { record.takeFullSnapshot(true); } catch { /* not recording yet */ }
  };

  function onFirstEvent() {
    started = true;
    slot.hidden = false;
    queueMicrotask(() => early.splice(0).forEach((e) => custom('early-console', e)));
  }

  try {
    const plugins = window.rrwebPluginConsoleRecord
      ? [window.rrwebPluginConsoleRecord.getRecordConsolePlugin({
          level: LEVELS, lengthThreshold: 1000, stringLengthLimit: 2000,
        })]
      : [];
    record({
      emit(event) {
        if (event.type === 5 && event.data && event.data.tag === 'report-click') {
          markerTime = event.timestamp;
        }
        buffer.push(event);
        if (!started) onFirstEvent();
      },
      recordAfter: 'DOMContentLoaded',
      checkoutEveryNms: CHECKOUT_MS,
      maskAllInputs: true,
      blockClass: 'rr-block',
      sampling: { mousemove: 20, mousemoveCallback: 100 },
      plugins,
    });
  } catch {
    return;
  }

  // rrweb only checks out when an event arrives, so an idle page would stop
  // rotating the buffer. Drive checkouts from a clock instead.
  setInterval(() => {
    if (started && Date.now() - buffer.lastCheckoutAt() >= CHECKOUT_MS) snapshot();
  }, 5000);

  // Background tabs throttle timers; mark the gap and resnapshot on return.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      custom('tab-hidden', {});
    } else {
      snapshot();
      custom('tab-visible', {});
    }
  });

  document.addEventListener('page:load', () => custom('navigate', { path: location.pathname }));

  // ---- dialog ----
  const form = document.getElementById('report-form');
  const note = document.getElementById('report-note');
  const status = document.getElementById('report-status');
  const send = document.getElementById('report-send');
  const cancel = document.getElementById('report-cancel');
  let pending = null; // { url, events: Promise<event[]> }

  link.addEventListener('click', () => {
    markerTime = 0;
    custom('report-click', {}); // sets markerTime synchronously via emit
    const marker = markerTime || Date.now();
    pending = {
      url: location.href,
      events: new Promise((resolve) => {
        setTimeout(() => resolve(buffer.freeze(marker)), FLUSH_MS);
      }),
    };
    status.textContent = '';
    send.disabled = false;
    send.textContent = 'Send';
    dialog.showModal();
  });

  cancel.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { pending = null; });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pending) return;
    send.disabled = true;
    status.textContent = 'Sending…';
    try {
      const res = await upload(await pending.events, pending.url, note.value);
      if (res.status === 201) {
        status.textContent = 'Sent, thanks.';
        note.value = '';
        setTimeout(() => dialog.close(), 1200);
        return;
      }
      status.textContent =
        res.status === 413 ? 'That recording is too large to send.'
        : res.status === 429 ? 'Too many reports just now. Try again in a minute.'
        : 'Could not send the report.';
    } catch {
      status.textContent = 'Could not send the report. Check your connection.';
    }
    send.disabled = false;
    send.textContent = 'Retry';
  });

  async function upload(events, url, noteText) {
    if (events.length === 0) throw new Error('nothing recorded');
    let blob = new Blob([JSON.stringify({ version: 1, events })], { type: 'application/json' });
    let encoding = 'identity';
    if (typeof CompressionStream === 'function') {
      blob = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
      encoding = 'gzip';
    }
    const meta = {
      version: 1,
      note: noteText.slice(0, 1000),
      url,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      userAgent: navigator.userAgent,
      startedAt: events[0].timestamp,
      endedAt: events[events.length - 1].timestamp,
      encoding,
    };
    const body = new FormData();
    body.append('meta', JSON.stringify(meta));
    body.append('events', blob, 'events');
    return fetch(ENDPOINT, { method: 'POST', body });
  }
})();
```

- [ ] **Step 2: Verify by hand that recording starts and the link appears**

Run: `npm run build && npm run preview` then open `http://localhost:4321` in Zen.
Expected:
- "report a problem" appears in the footer after load.
- Clicking it opens the dialog with the sentence, textarea, Cancel and Send; Esc and Cancel close it.
- With no Worker running, pressing Send shows "Could not send the report. Check your connection." and the button reads "Retry".
- No errors in the browser console from `report.js` or the vendor files.
- Navigating between pages keeps the link visible (the footer is persistent).

- [ ] **Step 3: Run the test suite**

Run: `node --test test/`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add public/js/report.js
git commit -m "Add problem-report recorder, dialog and upload"
```

---

### Task 4: Worker scaffold and ingest

**Files:**
- Create: `reports/package.json`, `reports/wrangler.toml`, `reports/.dev.vars.example`, `reports/testing/fakes.mjs`, `reports/src/ingest.js`
- Modify: `.gitignore`
- Test: `reports/test/ingest.test.mjs`

**Interfaces:**
- Consumes: the wire format from Task 3.
- Produces: `handleIngest(request, env) → Promise<Response>`; `newId(now?, rand?) → string`; `allowedOrigins(env) → string[]`; `MAX_BYTES`.
- Produces: `env` shape used by all Worker tasks — `REPORTS` (R2 bucket), `INGEST_LIMITER` (`{ limit({ key }) → Promise<{ success }> }`, optional), `ALLOWED_ORIGINS` (comma-separated), `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `DEV_NO_ACCESS`.
- Produces: `fakeBucket()` from `reports/testing/fakes.mjs` with `put(key, value)`, `get(key) → { body, text(), json(), arrayBuffer() } | null`, `list({ prefix, limit }) → { objects: [{ key }] }` (lexicographic), `delete(key | key[])`, and `keys()`.
- Produces: stored `meta.json` shape — `{ id, note, url, viewport: { width, height }, userAgent, startedAt, endedAt, receivedAt }`.

- [ ] **Step 1: Scaffold**

`reports/package.json`:

```json
{
  "name": "martilama-reports",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "node --test"
  }
}
```

Then: `cd reports && npm install --save-dev wrangler@latest && cd ..`

`reports/wrangler.toml`:

```toml
name = "martilama-reports"
main = "src/index.js"
compatibility_date = "2026-10-01"
routes = [{ pattern = "reports.martilama.com", custom_domain = true }]

[assets]
directory = "./public"

[[r2_buckets]]
binding = "REPORTS"
bucket_name = "martilama-reports"

[[ratelimits]]
name = "INGEST_LIMITER"
namespace_id = "1001"
simple = { limit = 5, period = 60 }

[vars]
ALLOWED_ORIGINS = "https://martilama.com"
# Fill both in after creating the Access application (README, "Reports").
# While either is empty the viewer answers 403 to everyone.
ACCESS_TEAM_DOMAIN = ""
ACCESS_AUD = ""
```

`reports/.dev.vars.example`:

```
ALLOWED_ORIGINS=http://localhost:4321
DEV_NO_ACCESS=1
```

Append to the root `.gitignore`:

```
reports/.dev.vars
reports/.wrangler/
```

- [ ] **Step 2: Write the R2 stand-in**

`reports/testing/fakes.mjs`:

```js
// In-memory stand-in for the parts of the R2 bucket API the Worker uses.
export function fakeBucket() {
  const store = new Map();
  const toBytes = async (v) => new Uint8Array(await new Response(v).arrayBuffer());
  return {
    async put(key, value) { store.set(key, await toBytes(value)); },
    async get(key) {
      const bytes = store.get(key);
      if (!bytes) return null;
      return {
        body: new Blob([bytes]).stream(),
        text: async () => new TextDecoder().decode(bytes),
        json: async () => JSON.parse(new TextDecoder().decode(bytes)),
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      };
    },
    async list({ prefix = '', limit = 1000 } = {}) {
      const keys = [...store.keys()].filter((k) => k.startsWith(prefix)).sort().slice(0, limit);
      return { objects: keys.map((key) => ({ key })) };
    },
    async delete(keys) { for (const k of [].concat(keys)) store.delete(k); },
    keys: () => [...store.keys()].sort(),
  };
}

export async function gzip(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}
```

- [ ] **Step 3: Write the failing tests**

`reports/test/ingest.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleIngest, newId, MAX_BYTES } from '../src/ingest.js';
import { fakeBucket, gzip, gunzip } from '../testing/fakes.mjs';

const SITE = 'https://martilama.com';
const EVENTS = JSON.stringify({ version: 1, events: [{ type: 4, timestamp: 1000 }] });
const env = (over = {}) => ({ REPORTS: fakeBucket(), ALLOWED_ORIGINS: SITE, ...over });
const goodMeta = (over = {}) => ({
  version: 1, note: 'nav broke', url: `${SITE}/blog`, viewport: { width: 1280, height: 720 },
  userAgent: 'test-agent', startedAt: 1000, endedAt: 181000, encoding: 'gzip', ...over,
});

async function req({ origin = SITE, meta = goodMeta(), events, method = 'POST', headers = {} } = {}) {
  const init = { method, headers: { Origin: origin, 'CF-Connecting-IP': '203.0.113.9', ...headers } };
  if (method === 'POST') {
    const form = new FormData();
    if (meta !== null) form.append('meta', typeof meta === 'string' ? meta : JSON.stringify(meta));
    const bytes = events === undefined ? await gzip(EVENTS) : events;
    if (bytes !== null) form.append('events', new Blob([bytes]), 'events');
    init.body = form;
  }
  return new Request('https://reports.martilama.com/ingest', init);
}

test('stores a gzipped report as two objects and returns its id', async () => {
  const e = env();
  const res = await handleIngest(await req(), e);
  assert.equal(res.status, 201);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), SITE);
  const { id } = await res.json();
  assert.match(id, /^\d{13}-[0-9a-f]{8}$/);
  assert.deepEqual(e.REPORTS.keys(), [`reports/${id}/events.json.gz`, `reports/${id}/meta.json`]);
  const stored = await (await e.REPORTS.get(`reports/${id}/events.json.gz`)).arrayBuffer();
  assert.equal(await gunzip(new Uint8Array(stored)), EVENTS);
});

test('stored meta has the note and page but no IP and no encoding', async () => {
  const e = env();
  const { id } = await (await handleIngest(await req(), e)).json();
  const meta = await (await e.REPORTS.get(`reports/${id}/meta.json`)).json();
  assert.equal(meta.id, id);
  assert.equal(meta.note, 'nav broke');
  assert.equal(meta.url, `${SITE}/blog`);
  assert.deepEqual(meta.viewport, { width: 1280, height: 720 });
  assert.equal(typeof meta.receivedAt, 'number');
  assert.ok(!JSON.stringify(meta).includes('203.0.113.9'));
  assert.equal(meta.encoding, undefined);
});

test('an uncompressed upload is gzipped before storage', async () => {
  const e = env();
  const r = await req({ meta: goodMeta({ encoding: 'identity' }), events: new TextEncoder().encode(EVENTS) });
  const { id } = await (await handleIngest(r, e)).json();
  const stored = await (await e.REPORTS.get(`reports/${id}/events.json.gz`)).arrayBuffer();
  assert.equal(await gunzip(new Uint8Array(stored)), EVENTS);
});

test('rejects other origins and missing origin', async () => {
  assert.equal((await handleIngest(await req({ origin: 'https://evil.example' }), env())).status, 403);
  const noOrigin = new Request('https://reports.martilama.com/ingest', { method: 'POST', body: 'x' });
  assert.equal((await handleIngest(noOrigin, env())).status, 403);
});

test('answers the CORS preflight', async () => {
  const res = await handleIngest(await req({ method: 'OPTIONS' }), env());
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), SITE);
  assert.match(res.headers.get('Access-Control-Allow-Methods'), /POST/);
});

test('rejects other methods', async () => {
  assert.equal((await handleIngest(await req({ method: 'GET' }), env())).status, 405);
});

test('rate limit: keyed by IP, answers 429', async () => {
  let key;
  const limiter = { limit: async (o) => { key = o.key; return { success: false }; } };
  const e = env({ INGEST_LIMITER: limiter });
  const res = await handleIngest(await req(), e);
  assert.equal(res.status, 429);
  assert.equal(key, '203.0.113.9');
  assert.deepEqual(e.REPORTS.keys(), []);
});

test('declared Content-Length over the cap is refused', async () => {
  const r = await req({ headers: { 'Content-Length': String(MAX_BYTES + 1) } });
  assert.equal((await handleIngest(r, env())).status, 413);
});

test('oversized body without Content-Length is refused and nothing is stored', async () => {
  const e = env();
  const r = await req({ events: new Uint8Array(MAX_BYTES + 1) });
  assert.equal(r.headers.get('Content-Length'), null);
  assert.equal((await handleIngest(r, e)).status, 413);
  assert.deepEqual(e.REPORTS.keys(), []);
});

test('malformed: body is not multipart', async () => {
  const r = new Request('https://reports.martilama.com/ingest', {
    method: 'POST', body: 'hello', headers: { Origin: SITE, 'Content-Type': 'text/plain' },
  });
  assert.equal((await handleIngest(r, env())).status, 400);
});

test('malformed: missing parts, bad meta, bad gzip', async () => {
  const cases = [
    { meta: null },
    { events: null },
    { meta: '{not json' },
    { meta: goodMeta({ note: 'x'.repeat(1001) }) },
    { meta: goodMeta({ url: 'https://evil.example/' }) },
    { meta: goodMeta({ url: 'not a url' }) },
    { meta: goodMeta({ viewport: { width: 'wide', height: 1 } }) },
    { meta: goodMeta({ startedAt: 5, endedAt: 1 }) },
    { meta: goodMeta({ encoding: 'br' }) },
    { events: new TextEncoder().encode('not gzip') },
  ];
  for (const c of cases) {
    const e = env();
    const res = await handleIngest(await req(c), e);
    assert.equal(res.status, 400, JSON.stringify(c).slice(0, 80));
    assert.deepEqual(e.REPORTS.keys(), []);
  }
});

test('newId sorts newest first', () => {
  const older = newId(1_700_000_000_000, 'aaaaaaaa');
  const newer = newId(1_700_000_001_000, 'aaaaaaaa');
  assert.ok(newer < older);
  assert.match(older, /^\d{13}-aaaaaaaa$/);
});
```

- [ ] **Step 4: Run to verify failure**

Run: `node --test reports/test/ingest.test.mjs`
Expected: FAIL — cannot find module `reports/src/ingest.js`.

- [ ] **Step 5: Implement**

`reports/src/ingest.js`:

```js
// Public upload endpoint. Accepts one multipart report from the site, checks
// origin, size and rate, validates the metadata, and stores it as two R2
// objects. The events blob is opaque here: stored, never parsed.
export const MAX_BYTES = 5 * 1024 * 1024;
const NOTE_MAX = 1000;
const UA_MAX = 400;

export const allowedOrigins = (env) =>
  (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

// Inverted timestamp so R2's lexicographic listing returns newest first.
export function newId(now = Date.now(), rand = crypto.randomUUID().replaceAll('-', '').slice(0, 8)) {
  return `${String(9999999999999 - now).padStart(13, '0')}-${rand}`;
}

export async function handleIngest(request, env) {
  const origins = allowedOrigins(env);
  const origin = request.headers.get('Origin');
  if (!origin || !origins.includes(origin)) return new Response('Forbidden', { status: 403 });
  const cors = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  const reply = (status, body) => (body === undefined
    ? new Response(null, { status, headers: cors })
    : Response.json(body, { status, headers: cors }));

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Max-Age': '86400' },
    });
  }
  if (request.method !== 'POST') return reply(405, { error: 'method not allowed' });

  if (env.INGEST_LIMITER) {
    const key = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const { success } = await env.INGEST_LIMITER.limit({ key });
    if (!success) return reply(429, { error: 'rate limited' });
  }

  if (Number(request.headers.get('Content-Length')) > MAX_BYTES) return reply(413, { error: 'too large' });
  if (!request.body) return reply(400, { error: 'empty body' });
  const bytes = await readCapped(request.body, MAX_BYTES);
  if (!bytes) return reply(413, { error: 'too large' });

  let form;
  try {
    form = await new Response(bytes, {
      headers: { 'Content-Type': request.headers.get('Content-Type') ?? '' },
    }).formData();
  } catch {
    return reply(400, { error: 'body is not multipart form data' });
  }

  const rawMeta = form.get('meta');
  const events = form.get('events');
  if (typeof rawMeta !== 'string' || !events || typeof events === 'string') {
    return reply(400, { error: 'meta and events parts are required' });
  }
  const checked = validateMeta(rawMeta, origins);
  if (checked.error) return reply(400, { error: checked.error });
  const { encoding, ...meta } = checked.meta;

  let stored = new Uint8Array(await events.arrayBuffer());
  if (encoding === 'gzip') {
    if (stored[0] !== 0x1f || stored[1] !== 0x8b) return reply(400, { error: 'events are not gzip' });
  } else {
    const gz = new Blob([stored]).stream().pipeThrough(new CompressionStream('gzip'));
    stored = new Uint8Array(await new Response(gz).arrayBuffer());
  }

  const id = newId();
  // Events first: a meta.json always has its events beside it.
  await env.REPORTS.put(`reports/${id}/events.json.gz`, stored);
  await env.REPORTS.put(`reports/${id}/meta.json`, JSON.stringify({ id, ...meta, receivedAt: Date.now() }));
  return reply(201, { id });
}

async function readCapped(stream, max) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

const posInt = (n) => Number.isInteger(n) && n > 0 && n < 100000;

function validateMeta(raw, origins) {
  let m;
  try {
    m = JSON.parse(raw);
  } catch {
    return { error: 'meta is not JSON' };
  }
  if (!m || typeof m !== 'object') return { error: 'meta is not an object' };
  const note = m.note ?? '';
  if (typeof note !== 'string' || note.length > NOTE_MAX) return { error: 'note too long' };
  let page;
  try {
    page = new URL(m.url);
  } catch {
    return { error: 'bad page url' };
  }
  if (!origins.includes(page.origin)) return { error: 'page url is not on an allowed origin' };
  const vp = m.viewport;
  if (!vp || !posInt(vp.width) || !posInt(vp.height)) return { error: 'bad viewport' };
  if (!Number.isFinite(m.startedAt) || !Number.isFinite(m.endedAt) || m.endedAt < m.startedAt) {
    return { error: 'bad timestamps' };
  }
  if (m.encoding !== 'gzip' && m.encoding !== 'identity') return { error: 'bad encoding' };
  return {
    meta: {
      note,
      url: page.href,
      viewport: { width: vp.width, height: vp.height },
      userAgent: typeof m.userAgent === 'string' ? m.userAgent.slice(0, UA_MAX) : '',
      startedAt: m.startedAt,
      endedAt: m.endedAt,
      encoding: m.encoding,
    },
  };
}
```

- [ ] **Step 6: Run to verify pass**

Run: `node --test reports/test/ingest.test.mjs`
Expected: 12 tests pass.

- [ ] **Step 7: Commit**

```bash
git add .gitignore reports/package.json reports/package-lock.json reports/wrangler.toml reports/.dev.vars.example reports/testing reports/src/ingest.js reports/test/ingest.test.mjs
git commit -m "Add reports Worker scaffold and ingest endpoint"
```

---

### Task 5: Cloudflare Access verification

**Files:**
- Create: `reports/src/access.js`
- Test: `reports/test/access.test.mjs`

**Interfaces:**
- Produces: `verifyAccess(request, env, { fetchImpl = fetch, now = Date.now() } = {}) → Promise<object | null>` — the token payload, or `null` for any failure. Reads the `Cf-Access-Jwt-Assertion` header, `env.ACCESS_TEAM_DOMAIN` (e.g. `myteam.cloudflareaccess.com`) and `env.ACCESS_AUD`.
- Produces: `isAuthorised(request, env) → Promise<boolean>` — `true` when `verifyAccess` succeeds, or when `env.DEV_NO_ACCESS === '1'` **and** the request hostname is `localhost` or `127.0.0.1`.

- [ ] **Step 1: Write the failing tests**

`reports/test/access.test.mjs`:

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { verifyAccess, isAuthorised } from '../src/access.js';

const TEAM = 'myteam.cloudflareaccess.com';
const AUD = 'aud-tag-123';
const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
const NOW = 1_800_000_000_000;
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const enc = (obj) => b64url(JSON.stringify(obj));

let keys;
let jwk;
before(async () => {
  keys = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify'],
  );
  jwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1' };
});

const fetchImpl = async (url) => {
  assert.equal(String(url), `https://${TEAM}/cdn-cgi/access/certs`);
  return Response.json({ keys: [jwk] });
};

async function token(claims = {}, header = {}) {
  const head = enc({ alg: 'RS256', kid: 'k1', ...header });
  const body = enc({ iss: `https://${TEAM}`, aud: [AUD], exp: NOW / 1000 + 60, email: 'm@example.com', ...claims });
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}
const request = (jwt, url = 'https://reports.martilama.com/') =>
  new Request(url, { headers: jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {} });
const verify = (jwt, e = env) => verifyAccess(request(jwt), e, { fetchImpl, now: NOW });

test('accepts a valid token and returns its payload', async () => {
  assert.equal((await verify(await token())).email, 'm@example.com');
});

test('rejects a missing or malformed token', async () => {
  assert.equal(await verify(null), null);
  assert.equal(await verify('abc'), null);
  assert.equal(await verify('a.b.c'), null);
});

test('rejects expired, wrong audience, wrong issuer', async () => {
  assert.equal(await verify(await token({ exp: NOW / 1000 - 1 })), null);
  assert.equal(await verify(await token({ aud: ['someone-else'] })), null);
  assert.equal(await verify(await token({ iss: 'https://other.cloudflareaccess.com' })), null);
});

test('rejects a tampered payload, unknown key and non-RS256', async () => {
  const [h, , s] = (await token()).split('.');
  const forged = enc({ iss: `https://${TEAM}`, aud: [AUD], exp: NOW / 1000 + 60, email: 'evil@example.com' });
  assert.equal(await verify(`${h}.${forged}.${s}`), null);
  assert.equal(await verify(await token({}, { kid: 'nope' })), null);
  assert.equal(await verify(await token({}, { alg: 'none' })), null);
});

test('fails closed when Access is not configured', async () => {
  const jwt = await token();
  assert.equal(await verify(jwt, { ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: AUD }), null);
  assert.equal(await verify(jwt, { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: '' }), null);
  assert.equal(await verify(jwt, {}), null);
});

test('dev bypass works only on localhost', async () => {
  const dev = { DEV_NO_ACCESS: '1' };
  assert.equal(await isAuthorised(request(null, 'http://localhost:8787/'), dev), true);
  assert.equal(await isAuthorised(request(null, 'http://127.0.0.1:8787/'), dev), true);
  assert.equal(await isAuthorised(request(null, 'https://reports.martilama.com/'), dev), false);
  assert.equal(await isAuthorised(request(null, 'http://localhost:8787/'), {}), false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test reports/test/access.test.mjs`
Expected: FAIL — cannot find module `reports/src/access.js`.

- [ ] **Step 3: Implement**

`reports/src/access.js`:

```js
// Verifies the Cloudflare Access JWT on viewer requests. Access already gates
// the hostname at the edge; this is a second check inside the Worker so a
// misconfigured Access policy fails closed instead of exposing reports.
const CERT_TTL_MS = 60 * 60 * 1000;
let certCache = { domain: '', at: 0, keys: [] };

const b64urlBytes = (s) => {
  const bin = atob(s.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

async function certs(domain, fetchImpl, now) {
  if (certCache.domain === domain && now - certCache.at < CERT_TTL_MS) return certCache.keys;
  const res = await fetchImpl(`https://${domain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`certs ${res.status}`);
  const { keys } = await res.json();
  certCache = { domain, at: now, keys: Array.isArray(keys) ? keys : [] };
  return certCache.keys;
}

export async function verifyAccess(request, env, { fetchImpl = fetch, now = Date.now() } = {}) {
  const domain = env.ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_AUD;
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!domain || !aud || !jwt) return null;
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    const [h, p, s] = parts;
    const header = b64urlJson(h);
    if (header.alg !== 'RS256') return null;
    const jwk = (await certs(domain, fetchImpl, now)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
    );
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', key, b64urlBytes(s), new TextEncoder().encode(`${h}.${p}`),
    );
    if (!valid) return null;
    const payload = b64urlJson(p);
    const auds = [].concat(payload.aud ?? []);
    if (!(payload.exp * 1000 > now)) return null;
    if (payload.iss !== `https://${domain}`) return null;
    if (!auds.includes(aud)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function isAuthorised(request, env) {
  const { hostname } = new URL(request.url);
  if (env.DEV_NO_ACCESS === '1' && (hostname === 'localhost' || hostname === '127.0.0.1')) return true;
  return (await verifyAccess(request, env)) !== null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test reports/test/access.test.mjs`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add reports/src/access.js reports/test/access.test.mjs
git commit -m "Verify Cloudflare Access tokens in the reports Worker"
```

---

### Task 6: Viewer routes and Worker entry point

**Files:**
- Create: `reports/src/html.js`, `reports/src/viewer.js`, `reports/src/index.js`
- Test: `reports/test/viewer.test.mjs`

**Interfaces:**
- Consumes: `handleIngest`, `allowedOrigins`, `newId` (Task 4); `isAuthorised` (Task 5); stored `meta.json` shape (Task 4); `fakeBucket`, `gzip` (Task 4).
- Produces: `handleViewer(request, env) → Promise<Response>` with routes `GET /`, `GET /r/:id`, `GET /api/reports/:id/events` (decompressed JSON `{"version":1,"events":[…]}`), `DELETE /api/reports/:id` (204).
- Produces (DOM contract for Task 7, on the report page): `<main id="report" data-id data-vw data-vh>`, `<div id="player">`, `<ol id="log">`, `<button id="delete">`; scripts `/vendor/rrweb-player.min.js`, `/entries.js`, `/viewer.js`; styles `/vendor/rrweb-player.min.css`, `/viewer.css`.
- Produces: `default { fetch(request, env) }` in `src/index.js`.

- [ ] **Step 1: Write the failing tests**

`reports/test/viewer.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { handleViewer } from '../src/viewer.js';
import { newId } from '../src/ingest.js';
import { fakeBucket, gzip } from '../testing/fakes.mjs';

const BASE = 'https://reports.martilama.com';
const EVENTS = JSON.stringify({ version: 1, events: [{ type: 4, timestamp: 1000 }] });

async function seed(bucket, { now, note = 'a note', withEvents = true } = {}) {
  const id = newId(now, 'abcdef01');
  const meta = {
    id, note, url: 'https://martilama.com/blog', viewport: { width: 1280, height: 720 },
    userAgent: 'test-agent', startedAt: now - 185000, endedAt: now, receivedAt: now,
  };
  if (withEvents) await bucket.put(`reports/${id}/events.json.gz`, await gzip(EVENTS));
  await bucket.put(`reports/${id}/meta.json`, JSON.stringify(meta));
  return id;
}
const env = () => ({ REPORTS: fakeBucket(), ALLOWED_ORIGINS: 'https://martilama.com' });
const get = (path, e, init) => handleViewer(new Request(BASE + path, init), e);

test('list shows newest first with duration and escaped note', async () => {
  const e = env();
  const older = await seed(e.REPORTS, { now: 1_700_000_000_000, note: 'first' });
  const newer = await seed(e.REPORTS, { now: 1_700_000_500_000, note: '<script>alert(1)</script>' });
  const res = await get('/', e);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Type'), /text\/html/);
  assert.match(res.headers.get('Content-Security-Policy'), /default-src 'none'/);
  const html = await res.text();
  assert.ok(html.indexOf(`/r/${newer}`) < html.indexOf(`/r/${older}`));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script>alert(1)'));
  assert.ok(html.includes('3:05'));
});

test('empty list renders', async () => {
  const html = await (await get('/', env())).text();
  assert.ok(html.includes('No reports yet.'));
});

test('list skips a meta object that is not valid JSON', async () => {
  const e = env();
  const good = await seed(e.REPORTS, { now: 1_700_000_000_000 });
  await e.REPORTS.put('reports/0000000000001-deadbeef/meta.json', '{broken');
  const res = await get('/', e);
  assert.equal(res.status, 200);
  assert.ok((await res.text()).includes(`/r/${good}`));
});

test('report page carries the data the viewer script needs', async () => {
  const e = env();
  const id = await seed(e.REPORTS, { now: 1_700_000_000_000, note: 'it "broke" <here>' });
  const html = await (await get(`/r/${id}`, e)).text();
  assert.ok(html.includes(`data-id="${id}"`));
  assert.ok(html.includes('data-vw="1280"') && html.includes('data-vh="720"'));
  assert.ok(html.includes('it &quot;broke&quot; &lt;here&gt;'));
  for (const s of ['id="player"', 'id="log"', 'id="delete"', '/vendor/rrweb-player.min.js', '/entries.js', '/viewer.js']) {
    assert.ok(html.includes(s), s);
  }
});

test('events API returns the decompressed JSON', async () => {
  const e = env();
  const id = await seed(e.REPORTS, { now: 1_700_000_000_000 });
  const res = await get(`/api/reports/${id}/events`, e);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), JSON.parse(EVENTS));
});

test('missing report: page and events answer 404', async () => {
  const e = env();
  const gone = newId(1_700_000_000_000, 'abcdef01');
  assert.equal((await get(`/r/${gone}`, e)).status, 404);
  assert.equal((await get(`/api/reports/${gone}/events`, e)).status, 404);
  const metaOnly = await seed(e.REPORTS, { now: 1_700_000_900_000, withEvents: false });
  assert.equal((await get(`/api/reports/${metaOnly}/events`, e)).status, 404);
});

test('malformed ids and unknown paths answer 404', async () => {
  const e = env();
  for (const p of ['/r/..%2F..%2Fsecret', '/r/abc', '/api/reports/abc/events', '/nope']) {
    assert.equal((await get(p, e)).status, 404, p);
  }
});

test('delete removes both objects; cross-origin delete is refused', async () => {
  const e = env();
  const id = await seed(e.REPORTS, { now: 1_700_000_000_000 });
  const cross = await get(`/api/reports/${id}`, e, { method: 'DELETE', headers: { Origin: 'https://evil.example' } });
  assert.equal(cross.status, 403);
  assert.equal(e.REPORTS.keys().length, 2);
  const ok = await get(`/api/reports/${id}`, e, { method: 'DELETE', headers: { Origin: BASE } });
  assert.equal(ok.status, 204);
  assert.deepEqual(e.REPORTS.keys(), []);
});

test('entry point: /ingest is public, everything else needs Access', async () => {
  const e = env();
  const id = await seed(e.REPORTS, { now: 1_700_000_000_000 });
  for (const p of ['/', `/r/${id}`, `/api/reports/${id}/events`]) {
    assert.equal((await worker.fetch(new Request(BASE + p), e)).status, 403, p);
  }
  const del = await worker.fetch(new Request(`${BASE}/api/reports/${id}`, { method: 'DELETE' }), e);
  assert.equal(del.status, 403);
  assert.equal(e.REPORTS.keys().length, 2);
  const ingest = await worker.fetch(new Request(`${BASE}/ingest`, { method: 'GET', headers: { Origin: 'https://martilama.com' } }), e);
  assert.equal(ingest.status, 405);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test reports/test/viewer.test.mjs`
Expected: FAIL — cannot find module `reports/src/index.js`.

- [ ] **Step 3: Implement `reports/src/html.js`**

```js
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);

export function fmtDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const fmtDate = (ms) => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

// Replays load the recorded site's images, fonts and styles, so those origins
// are allowed for exactly that and nothing else. rrweb injects inline styles.
function csp(siteOrigins) {
  const sites = siteOrigins.join(' ');
  return [
    "default-src 'none'",
    "script-src 'self'",
    `style-src 'self' 'unsafe-inline' ${sites}`,
    `img-src 'self' data: blob: ${sites}`,
    `font-src data: ${sites}`,
    `media-src ${sites}`,
    "connect-src 'self'",
    "frame-src 'self' about: blob:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function htmlPage({ title, body, siteOrigins, status = 200 }) {
  const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/viewer.css">
</head>
<body>
${body}
</body>
</html>`;
  return new Response(doc, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': csp(siteOrigins),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
```

- [ ] **Step 4: Implement `reports/src/viewer.js`**

```js
// Private viewer: list of reports, one report page, and the two API routes
// the report page uses. Everything here sits behind the Access check in
// index.js. All stored text is untrusted and escaped on output.
import { esc, fmtDate, fmtDuration, htmlPage } from './html.js';
import { allowedOrigins } from './ingest.js';

const ID = /^\d{13}-[0-9a-f]{8}$/;
const LIST_LIMIT = 50;
const metaKey = (id) => `reports/${id}/meta.json`;
const eventsKey = (id) => `reports/${id}/events.json.gz`;

async function readMeta(env, id) {
  const obj = await env.REPORTS.get(metaKey(id));
  if (!obj) return null;
  try {
    return await obj.json();
  } catch {
    return null;
  }
}

async function listMetas(env) {
  // Two objects per report, so ask for twice the page size.
  const { objects } = await env.REPORTS.list({ prefix: 'reports/', limit: LIST_LIMIT * 2 });
  const ids = objects
    .map((o) => o.key.match(/^reports\/([^/]+)\/meta\.json$/)?.[1])
    .filter((id) => id && ID.test(id))
    .slice(0, LIST_LIMIT);
  return (await Promise.all(ids.map((id) => readMeta(env, id)))).filter(Boolean);
}

const pathOf = (url) => {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
};

async function listPage(env) {
  const metas = await listMetas(env);
  const rows = metas.map((m) => `
    <li><a href="/r/${esc(m.id)}">
      <time>${esc(fmtDate(m.receivedAt))}</time>
      <span class="page">${esc(pathOf(m.url))}</span>
      <span class="dur">${esc(fmtDuration(m.endedAt - m.startedAt))}</span>
      <span class="note">${esc(m.note) || '<em>no note</em>'}</span>
    </a></li>`).join('');
  const body = `<main class="list">
  <h1>Problem reports</h1>
  ${metas.length ? `<ul class="reports">${rows}</ul>` : '<p class="empty">No reports yet.</p>'}
</main>`;
  return htmlPage({ title: 'Problem reports', body, siteOrigins: allowedOrigins(env) });
}

async function reportPage(env, id) {
  const m = await readMeta(env, id);
  if (!m) return notFound(env);
  const body = `<main class="report" id="report" data-id="${esc(m.id)}" data-vw="${esc(m.viewport.width)}" data-vh="${esc(m.viewport.height)}">
  <header>
    <a class="back" href="/">← all reports</a>
    <h1>${esc(fmtDate(m.receivedAt))}</h1>
    <p class="note">${esc(m.note) || '<em>no note</em>'}</p>
    <dl>
      <dt>Page</dt><dd>${esc(m.url)}</dd>
      <dt>Length</dt><dd>${esc(fmtDuration(m.endedAt - m.startedAt))}</dd>
      <dt>Viewport</dt><dd>${esc(m.viewport.width)} × ${esc(m.viewport.height)}</dd>
      <dt>Browser</dt><dd>${esc(m.userAgent)}</dd>
    </dl>
    <button type="button" id="delete">Delete report</button>
  </header>
  <div class="stage">
    <div id="player"></div>
    <ol id="log" class="log"></ol>
  </div>
</main>
<link rel="stylesheet" href="/vendor/rrweb-player.min.css">
<script src="/vendor/rrweb-player.min.js"></script>
<script src="/entries.js"></script>
<script src="/viewer.js"></script>`;
  return htmlPage({ title: `Report ${fmtDate(m.receivedAt)}`, body, siteOrigins: allowedOrigins(env) });
}

async function eventsResponse(env, id) {
  const obj = await env.REPORTS.get(eventsKey(id));
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body.pipeThrough(new DecompressionStream('gzip')), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function notFound(env) {
  return htmlPage({
    title: 'Not found',
    status: 404,
    siteOrigins: allowedOrigins(env),
    body: '<main class="list"><h1>Report not found</h1><p>It may have expired or been deleted.</p><p><a href="/">← all reports</a></p></main>',
  });
}

export async function handleViewer(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;
  const { method } = request;

  if (pathname === '/' && method === 'GET') return listPage(env);

  let m = pathname.match(/^\/r\/([^/]+)$/);
  if (m && method === 'GET') return ID.test(m[1]) ? reportPage(env, m[1]) : notFound(env);

  m = pathname.match(/^\/api\/reports\/([^/]+)\/events$/);
  if (m && method === 'GET') {
    return ID.test(m[1]) ? eventsResponse(env, m[1]) : new Response('Not found', { status: 404 });
  }

  m = pathname.match(/^\/api\/reports\/([^/]+)$/);
  if (m && method === 'DELETE') {
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return new Response('Forbidden', { status: 403 });
    if (!ID.test(m[1])) return new Response('Not found', { status: 404 });
    await env.REPORTS.delete([eventsKey(m[1]), metaKey(m[1])]);
    return new Response(null, { status: 204 });
  }

  return notFound(env);
}
```

- [ ] **Step 5: Implement `reports/src/index.js`**

```js
import { handleIngest } from './ingest.js';
import { isAuthorised } from './access.js';
import { handleViewer } from './viewer.js';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    // The only public route. Cloudflare Access bypasses this exact path.
    if (pathname === '/ingest') return handleIngest(request, env);
    if (!(await isAuthorised(request, env))) return new Response('Forbidden', { status: 403 });
    return handleViewer(request, env);
  },
};
```

- [ ] **Step 6: Run to verify pass**

Run: `node --test reports/test/`
Expected: all ingest, access and viewer tests pass (27 total).

- [ ] **Step 7: Commit**

```bash
git add reports/src/html.js reports/src/viewer.js reports/src/index.js reports/test/viewer.test.mjs
git commit -m "Add reports viewer routes and Worker entry point"
```

---

### Task 7: Viewer client — player and synced panel

**Files:**
- Create: `reports/public/entries.js`, `reports/public/viewer.js`, `reports/public/viewer.css`, `reports/public/vendor/rrweb-player.min.js`, `reports/public/vendor/rrweb-player.min.css`
- Test: `reports/test/entries.test.mjs`

**Interfaces:**
- Consumes: the report-page DOM contract and `GET /api/reports/:id/events`, `DELETE /api/reports/:id` (Task 6); custom event tags (Task 3); global `rrwebPlayer.default`.
- Produces: `globalThis.ReportEntries.build(events) → [{ offset: number, kind: 'console' | 'nav' | 'tab' | 'report', level: string, text: string }]`, `offset` in ms from `events[0].timestamp`, sorted by offset.

- [ ] **Step 1: Write the failing tests**

`reports/test/entries.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../public/entries.js';

const { build } = globalThis.ReportEntries;
const T0 = 1000;
const base = [{ type: 4, timestamp: T0, data: {} }, { type: 2, timestamp: T0, data: {} }];
const consoleEv = (t, level, args) => ({
  type: 6, timestamp: t, data: { plugin: 'rrweb/console@1', payload: { level, trace: [], payload: args.map((a) => JSON.stringify(a)) } },
});
const customEv = (t, tag, payload = {}) => ({ type: 5, timestamp: t, data: { tag, payload } });

test('console events become entries with level and joined text', () => {
  const out = build([...base, consoleEv(T0 + 500, 'error', ['boom', { a: 1 }])]);
  assert.deepEqual(out, [{ offset: 500, kind: 'console', level: 'error', text: 'boom {"a":1}' }]);
});

test('navigation, tab and report markers become entries', () => {
  const out = build([
    ...base,
    customEv(T0 + 100, 'navigate', { path: '/blog' }),
    customEv(T0 + 200, 'tab-hidden'),
    customEv(T0 + 300, 'tab-visible'),
    customEv(T0 + 400, 'report-click'),
  ]);
  assert.deepEqual(out.map((e) => [e.offset, e.kind, e.text]), [
    [100, 'nav', 'Navigated to /blog'],
    [200, 'tab', 'Tab hidden'],
    [300, 'tab', 'Tab visible again'],
    [400, 'report', 'Clicked "report a problem"'],
  ]);
});

test('early console uses its own recorded time and is sorted in', () => {
  const out = build([
    ...base,
    consoleEv(T0 + 50, 'log', ['later']),
    customEv(T0 + 60, 'early-console', { level: 'warn', time: T0 + 10, args: ['first'] }),
  ]);
  assert.deepEqual(out.map((e) => [e.offset, e.level, e.text]), [[10, 'warn', 'first'], [50, 'log', 'later']]);
});

test('early console from before the first event is clamped to 0', () => {
  const out = build([...base, customEv(T0 + 60, 'early-console', { level: 'log', time: T0 - 40, args: ['x'] })]);
  assert.equal(out[0].offset, 0);
});

test('unknown events, other plugins and malformed payloads are ignored', () => {
  const out = build([
    ...base,
    { type: 3, timestamp: T0 + 1, data: { source: 2 } },
    { type: 6, timestamp: T0 + 2, data: { plugin: 'other@1', payload: {} } },
    { type: 6, timestamp: T0 + 3, data: { plugin: 'rrweb/console@1', payload: null } },
    customEv(T0 + 4, 'something-else'),
    { type: 5, timestamp: T0 + 5, data: null },
  ]);
  assert.deepEqual(out, []);
  assert.deepEqual(build([]), []);
});

test('a console argument that is not valid JSON is shown as is', () => {
  const ev = consoleEv(T0 + 1, 'log', []);
  ev.data.payload.payload = ['[object Object]', '"quoted"'];
  assert.equal(build([...base, ev])[0].text, '[object Object] quoted');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test reports/test/entries.test.mjs`
Expected: FAIL — cannot find module `reports/public/entries.js`.

- [ ] **Step 3: Implement `reports/public/entries.js`**

```js
// Turns an rrweb event stream into the viewer's side-panel entries: console
// lines, navigations and tab hidden/visible moments. Pure, so it runs as a
// classic script in the viewer and is imported directly by node:test.
(function (g) {
  const CUSTOM = 5;
  const PLUGIN = 6;
  const CONSOLE_PLUGIN = 'rrweb/console@1';

  // The console plugin JSON-stringifies each argument; show strings unquoted.
  function show(arg) {
    try {
      const v = JSON.parse(arg);
      return typeof v === 'string' ? v : arg;
    } catch {
      return String(arg);
    }
  }

  function build(events) {
    if (!events.length) return [];
    const t0 = events[0].timestamp;
    const out = [];
    for (const ev of events) {
      const d = ev.data;
      if (!d) continue;
      const offset = ev.timestamp - t0;
      if (ev.type === PLUGIN && d.plugin === CONSOLE_PLUGIN && d.payload && Array.isArray(d.payload.payload)) {
        out.push({ offset, kind: 'console', level: String(d.payload.level), text: d.payload.payload.map(show).join(' ') });
      } else if (ev.type === CUSTOM) {
        const p = d.payload || {};
        if (d.tag === 'early-console' && Array.isArray(p.args)) {
          out.push({ offset: Math.max(0, p.time - t0), kind: 'console', level: String(p.level), text: p.args.join(' ') });
        } else if (d.tag === 'navigate') {
          out.push({ offset, kind: 'nav', level: 'info', text: `Navigated to ${p.path}` });
        } else if (d.tag === 'tab-hidden') {
          out.push({ offset, kind: 'tab', level: 'info', text: 'Tab hidden' });
        } else if (d.tag === 'tab-visible') {
          out.push({ offset, kind: 'tab', level: 'info', text: 'Tab visible again' });
        } else if (d.tag === 'report-click') {
          out.push({ offset, kind: 'report', level: 'info', text: 'Clicked "report a problem"' });
        }
      }
    }
    return out.sort((a, b) => a.offset - b.offset);
  }

  g.ReportEntries = { build };
})(globalThis);
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test reports/test/entries.test.mjs`
Expected: 6 tests pass.

- [ ] **Step 5: Vendor the player**

```bash
mkdir -p reports/public/vendor
tmp=$(mktemp -d)
npm pack rrweb-player@2.1.7 --pack-destination "$tmp" --silent
tar -xzf "$tmp/rrweb-player-2.1.7.tgz" -C "$tmp"
{ echo '/*! rrweb-player 2.1.7 (MIT) — vendored, do not edit */'
  grep -v '^//# sourceMappingURL' "$tmp/package/dist/rrweb-player.umd.min.cjs"
} > reports/public/vendor/rrweb-player.min.js
grep -v 'sourceMappingURL' "$tmp/package/dist/style.min.css" > reports/public/vendor/rrweb-player.min.css
rm -rf "$tmp"
grep -c 'rrwebPlayer' reports/public/vendor/rrweb-player.min.js
```

Expected: the final line prints a number ≥ 1.

- [ ] **Step 6: Write `reports/public/viewer.js`**

```js
// Report page: loads the events, mounts rrweb-player, and keeps the side
// panel (console, navigations, tab changes) in step with playback.
(async function () {
  const root = document.getElementById('report');
  const log = document.getElementById('log');
  const mount = document.getElementById('player');
  const id = root.dataset.id;

  document.getElementById('delete').addEventListener('click', async () => {
    if (!confirm('Delete this report? This cannot be undone.')) return;
    const res = await fetch(`/api/reports/${id}`, { method: 'DELETE' });
    if (res.status === 204) location.href = '/';
    else alert('Could not delete the report.');
  });

  const fail = (msg) => { mount.textContent = msg; };

  let events;
  try {
    const res = await fetch(`/api/reports/${id}/events`);
    if (!res.ok) return fail('This recording is no longer available.');
    ({ events } = await res.json());
  } catch {
    return fail('Could not load the recording.');
  }
  // rrweb needs a Meta + FullSnapshot pair to draw anything.
  if (!Array.isArray(events) || events.length < 2) return fail('This recording is empty.');

  const vw = Number(root.dataset.vw) || 1280;
  const vh = Number(root.dataset.vh) || 720;
  const width = mount.clientWidth;
  const height = Math.round(Math.min(window.innerHeight * 0.7, width * (vh / vw)));

  const Player = window.rrwebPlayer.default || window.rrwebPlayer.Player || window.rrwebPlayer;
  const player = new Player({
    target: mount,
    props: { events, width, height, autoPlay: false, skipInactive: false, showController: true },
  });

  const fmt = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const entries = window.ReportEntries.build(events);
  const items = entries.map((entry) => {
    const li = document.createElement('li');
    li.className = `entry ${entry.kind} lvl-${entry.level}`;
    const time = document.createElement('time');
    time.textContent = fmt(entry.offset);
    const text = document.createElement('span');
    text.textContent = entry.text;
    li.append(time, text);
    li.addEventListener('click', () => player.goto(entry.offset));
    log.append(li);
    return li;
  });
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'entry empty';
    li.textContent = 'No console output or navigation in this recording.';
    log.append(li);
  }

  let lastShown = -1;
  player.addEventListener('ui-update-current-time', (e) => {
    const now = e.payload;
    let current = -1;
    for (let i = 0; i < entries.length; i++) {
      const past = entries[i].offset <= now;
      items[i].classList.toggle('past', past);
      if (past) current = i;
    }
    if (current !== lastShown && current >= 0) {
      items[current].scrollIntoView({ block: 'nearest' });
      lastShown = current;
    }
  });
})();
```

- [ ] **Step 7: Write `reports/public/viewer.css`**

```css
:root {
  --bg: #faf8f5; --text: #2b2722; --muted: #6b6358; --border: #e7e0d6;
  --accent: #b85c38; --panel: #f3eee7; --warn: #9a6a00; --error: #b3261e;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #14110e; --text: #e8e2d9; --muted: #9a9085; --border: #2a241e;
    --accent: #e0915f; --panel: #1c1814; --warn: #e2b354; --error: #ff8a80;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, sans-serif; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
main { max-width: 1400px; margin: 0 auto; padding: 2rem 1rem 4rem; }
main.list { max-width: 60rem; }
h1 { margin: 0 0 1rem; font-size: 1.5rem; }
.empty, em { color: var(--muted); }

.reports { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--border); }
.reports a {
  display: grid; grid-template-columns: 11rem 1fr 4rem; gap: 0.25rem 1rem;
  padding: 0.8rem 0.5rem; color: inherit; border-bottom: 1px solid var(--border);
}
.reports a:hover { background: var(--panel); text-decoration: none; }
.reports time, .reports .dur { color: var(--muted); font-variant-numeric: tabular-nums; }
.reports .dur { text-align: right; }
.reports .page { overflow-wrap: anywhere; }
.reports .note { grid-column: 1 / -1; overflow-wrap: anywhere; }

.report header { margin-bottom: 1.5rem; }
.report .back { display: inline-block; margin-bottom: 0.75rem; }
.report .note { margin: 0 0 1rem; font-size: 1.1rem; overflow-wrap: anywhere; }
.report dl { display: grid; grid-template-columns: 6rem 1fr; gap: 0.2rem 1rem; margin: 0 0 1rem; font-size: 0.9rem; }
.report dt { color: var(--muted); }
.report dd { margin: 0; overflow-wrap: anywhere; }
#delete {
  font: inherit; padding: 0.4rem 0.9rem; cursor: pointer; border-radius: 6px;
  color: var(--error); background: transparent; border: 1px solid var(--border);
}
#delete:hover { border-color: var(--error); }

.stage { display: grid; grid-template-columns: minmax(0, 1fr) 24rem; gap: 1rem; align-items: start; }
#player { min-width: 0; color: var(--muted); }
.log {
  list-style: none; margin: 0; padding: 0; max-height: 80vh; overflow-y: auto;
  background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
  font: 0.8rem/1.45 ui-monospace, "JetBrains Mono", monospace;
}
.entry {
  display: grid; grid-template-columns: 3rem 1fr; gap: 0.5rem; padding: 0.35rem 0.6rem;
  border-bottom: 1px solid var(--border); cursor: pointer; opacity: 0.45;
}
.entry.past { opacity: 1; }
.entry:hover { background: color-mix(in oklab, var(--accent) 12%, transparent); }
.entry time { color: var(--muted); font-variant-numeric: tabular-nums; }
.entry span { overflow-wrap: anywhere; white-space: pre-wrap; }
.entry.lvl-warn span { color: var(--warn); }
.entry.lvl-error span { color: var(--error); }
.entry.nav span, .entry.tab span, .entry.report span { color: var(--accent); font-style: italic; }
.entry.empty { display: block; cursor: default; opacity: 1; color: var(--muted); }

@media (max-width: 900px) {
  .stage { grid-template-columns: minmax(0, 1fr); }
  .log { max-height: 40vh; }
  .reports a { grid-template-columns: 1fr 4rem; }
  .reports time { grid-column: 1 / -1; }
}
```

- [ ] **Step 8: Run the Worker tests**

Run: `node --test reports/test/`
Expected: all pass (33 total).

- [ ] **Step 9: Commit**

```bash
git add reports/public reports/test/entries.test.mjs
git commit -m "Add reports viewer client: player with synced console panel"
```

---

### Task 8: Local end-to-end check and deploy notes

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Check the Worker config parses**

Run: `cd reports && cp .dev.vars.example .dev.vars && npx wrangler deploy --dry-run --outdir /tmp/reports-dry && cd ..`
Expected: wrangler lists the bindings `REPORTS` (R2), `INGEST_LIMITER` (rate limit) and the `ALLOWED_ORIGINS` var, and exits 0 without deploying. If it rejects the `[[ratelimits]]` block, check the current syntax with `npx wrangler docs` / the Workers Rate Limiting documentation, fix `wrangler.toml`, and re-run before continuing.

- [ ] **Step 2: Run both halves locally**

Terminal 1: `cd reports && npx wrangler dev` (serves `http://localhost:8787`, local R2 simulation).
Terminal 2: `npm run build && npm run preview` (serves `http://localhost:4321`).

- [ ] **Step 3: Active-visitor check (Zen, then Chromium)**

1. Open `http://localhost:4321`. In devtools run `console.log('hello'); console.warn('careful'); console.error('boom')`.
2. Browse for a little over 4 minutes: visit Blog, open a post, scroll, select some text, go to About.
3. Click "report a problem", type a note, press Send. Expect "Sent, thanks." and the dialog closes.
4. Open `http://localhost:8787/`. Expect one report with the note, the page path and a length between 3:00 and 3:30.
5. Open it and press play. Expect: the replay shows the browsing, the cursor moves smoothly, the last thing that happens is the cursor arriving on the footer link, and the dialog never appears.
6. Expect the side panel to list the three console lines (warn and error coloured), the navigations, and a final `Clicked "report a problem"` entry; clicking an entry seeks the replay.
7. Check the viewer's devtools console for Content-Security-Policy violations. If rrweb-player is blocked from something it needs, widen only the matching directive in `csp()` in `reports/src/html.js`, re-run `node --test reports/test/`, and note the change in the commit.

Fonts in local replays fall back to system fonts (the preview server sends no CORS header); that is expected locally and fixed in production by `public/_headers`.

- [ ] **Step 4: Idle and background checks**

1. Load a page and touch nothing for 4 minutes, then report. Expect a replay of 3:00–3:30 of stillness that plays in real time (not skipped).
2. Load a page, switch to another tab for 2 minutes, come back, wait 1 minute, report. Expect `Tab hidden` and `Tab visible again` entries in the panel.
3. Click "report a problem", press Cancel, browse for 30 seconds, report again and send. Expect the replay to end on the second click.
4. Stop `wrangler dev`, click "report a problem", press Send. Expect the failure message and a Retry button. Restart `wrangler dev`, press Retry. Expect "Sent, thanks."
5. Send six reports within a minute. Expect the sixth to show "Too many reports just now. Try again in a minute."

- [ ] **Step 5: Document deployment**

Append to `README.md`:

````markdown
## Problem reports

Visitors can click "report a problem" in the footer to send a replay of about
their last 3 minutes on the site, plus the console log. Reports are viewed at
`reports.martilama.com`. Design: `docs/superpowers/specs/2026-10-08-problem-report-replay-design.md`.

- Site half: `public/js/report.js`, `public/js/report-buffer.js`, `public/js/vendor/`.
- Worker half: `reports/` (its own `package.json`; deployed separately).

### Run locally

```bash
cd reports && cp .dev.vars.example .dev.vars && npx wrangler dev   # http://localhost:8787
npm run build && npm run preview                                    # http://localhost:4321
```

On `localhost` the site uploads to `http://localhost:8787/ingest`, and the
viewer skips the Access check (`DEV_NO_ACCESS=1` is honoured on localhost only).

### First deploy

1. `cd reports && npx wrangler r2 bucket create martilama-reports`
2. In the Cloudflare dashboard, R2 → `martilama-reports` → Settings → Object
   lifecycle rules: delete objects with prefix `reports/` after 30 days.
3. `npx wrangler deploy` (attaches the `reports.martilama.com` custom domain).
4. Zero Trust → Access → Applications → add a self-hosted application for
   `reports.martilama.com` with an Allow policy for your own login.
5. Add a second self-hosted application for `reports.martilama.com/ingest`
   with a single **Bypass** policy for Everyone.
6. Copy the first application's **Application Audience (AUD) tag** and your
   team domain (`<team>.cloudflareaccess.com`) into `ACCESS_AUD` and
   `ACCESS_TEAM_DOMAIN` in `reports/wrangler.toml`, then `npx wrangler deploy`
   again. Until both are set the viewer answers 403 to everyone.
7. Merge the site half to `main` and push.

### Updating rrweb

The three rrweb bundles are vendored at 2.1.7. To update, re-run the `npm pack`
commands in `docs/superpowers/plans/2026-10-08-problem-report-replay.md`
(Tasks 2 and 7) with the new version, for all three together.
````

- [ ] **Step 6: Final test run and commit**

Run: `node --test`
Expected: every test in `test/` and `reports/test/` passes.

```bash
git add README.md
git commit -m "Document problem reports: local run and first deploy"
```

Deploying the Worker, the Cloudflare dashboard steps, and merging to `main` are Marti's to do (README "First deploy"); this plan stops at a verified branch.
