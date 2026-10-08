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

  // Key presses that act on the page (never typed characters; see describeKey).
  document.addEventListener('keydown', (e) => {
    const el = e.target instanceof Element ? e.target : null;
    const combo = window.ReportBuffer.describeKey({
      key: e.key, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey, shiftKey: e.shiftKey,
      repeat: e.repeat,
      typing: !!el?.closest('input, textarea, select, [contenteditable], .rr-block'),
    });
    if (combo) custom('key', { combo });
  }, true);

  // Network requests: method, address, status and time. Never bodies or headers.
  const net = (method, url, status, start, error) => {
    if (String(url).startsWith(ENDPOINT)) return; // our own upload
    const payload = { method: String(method).toUpperCase(), url: String(url).slice(0, 300), status, ms: Math.round(performance.now() - start) };
    if (error) payload.error = String(error).slice(0, 200);
    custom('net', payload);
  };
  if (typeof window.fetch === 'function') {
    const realFetch = window.fetch;
    window.fetch = function (input, init) {
      const start = performance.now();
      const method = (init && init.method) || (input && input.method) || 'GET';
      const url = typeof input === 'string' ? new URL(input, location.href).href : (input && input.url) || String(input);
      const pending = realFetch.apply(this, arguments);
      pending.then(
        (res) => net(method, url, res.status, start),
        (err) => net(method, url, 0, start, err && err.message),
      );
      return pending;
    };
  }
  if (typeof XMLHttpRequest === 'function') {
    const realOpen = XMLHttpRequest.prototype.open;
    const realSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      try { this.__report = { method, url: new URL(url, location.href).href }; } catch { /* odd address */ }
      return realOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      const info = this.__report;
      if (info) {
        const start = performance.now();
        this.addEventListener('loadend', () => net(info.method, info.url, this.status, start));
      }
      return realSend.apply(this, arguments);
    };
  }

  // Images, scripts, stylesheets and media that fail to load. These error
  // events do not bubble, so listen in the capture phase.
  window.addEventListener('error', (e) => {
    const el = e.target;
    if (!(el instanceof Element)) return; // a script error, already in the console
    custom('resource-error', { tag: el.tagName.toLowerCase(), url: String(el.currentSrc || el.src || el.href || '').slice(0, 300) });
  }, true);

  // Layout shifts ("the page jumped") and long freezes, where the browser reports them.
  const watch = (type, onEntry) => {
    try {
      if (!PerformanceObserver.supportedEntryTypes.includes(type)) return;
      new PerformanceObserver((list) => list.getEntries().forEach(onEntry)).observe({ type, buffered: false });
    } catch { /* not supported */ }
  };
  watch('layout-shift', (entry) => {
    if (!entry.hadRecentInput && entry.value >= 0.02) custom('layout-shift', { value: Math.round(entry.value * 1000) / 1000 });
  });
  watch('longtask', (entry) => {
    if (entry.duration >= 100) custom('long-task', { ms: Math.round(entry.duration) });
  });

  window.addEventListener('offline', () => custom('offline', {}));
  window.addEventListener('online', () => custom('online', {}));

  // The visitor's setup, sent with a report: nothing that identifies them.
  function environment() {
    const mq = (query) => { try { return matchMedia(query).matches; } catch { return undefined; } };
    const env = {
      screen: { width: screen.width, height: screen.height },
      pixelRatio: Math.round(window.devicePixelRatio * 100) / 100,
      language: navigator.language,
      colorScheme: mq('(prefers-color-scheme: dark)') ? 'dark' : 'light',
      theme: document.documentElement.dataset.theme,
      pointer: mq('(pointer: coarse)') ? 'coarse' : mq('(pointer: fine)') ? 'fine' : 'none',
      touchPoints: navigator.maxTouchPoints,
      online: navigator.onLine,
      reducedMotion: mq('(prefers-reduced-motion: reduce)'),
    };
    try { env.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* unavailable */ }
    if (navigator.connection && navigator.connection.effectiveType) env.connection = navigator.connection.effectiveType;
    return env;
  }

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
      env: environment(),
    };
    const body = new FormData();
    body.append('meta', JSON.stringify(meta));
    body.append('events', blob, 'events');
    return fetch(ENDPOINT, { method: 'POST', body });
  }
})();
