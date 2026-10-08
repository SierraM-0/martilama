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

// Every report id, newest first (ids are inverted timestamps).
async function listIds(env) {
  const { objects } = await env.REPORTS.list({ prefix: 'reports/', limit: 1000 });
  return objects
    .map((o) => o.key.match(/^reports\/([^/]+)\/meta\.json$/)?.[1])
    .filter((id) => id && ID.test(id));
}

async function listMetas(env) {
  const ids = (await listIds(env)).slice(0, LIST_LIMIT);
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
  const site = allowedOrigins(env)[0] ?? 'https://martilama.com';
  // Each row is a single link, so the whole row is clickable.
  const rows = metas.map((m) => `
    <li><a class="row" href="/r/${esc(m.id)}">
      <span class="when">${esc(fmtDate(m.receivedAt))}</span>
      <span class="page">${esc(pathOf(m.url))}</span>
      <span class="note">${esc(m.note) || '<em>No note</em>'}</span>
      <span class="dur">${esc(fmtDuration(m.endedAt - m.startedAt))}</span>
    </a></li>`).join('');
  const table = `<div class="reports">
    <div class="row head" aria-hidden="true"><span>Received</span><span>Page</span><span>Note</span><span class="dur">Length</span></div>
    <ol>${rows}
    </ol>
  </div>`;
  const body = `<main class="list">
  ${RUNE_MARK}
  <header class="site-header">
    <h1 class="brand"><a href="/">
      ${LOGO}
      <span class="name">martilama</span>
      <span class="what">problem reports</span>
    </a></h1>
    <nav>
      <a href="${esc(new URL('/', site).href)}">${esc(new URL(site).host)}</a>
      ${THEME_TOGGLE}
    </nav>
  </header>
  ${metas.length ? table : '<p class="empty">No reports yet.</p>'}
</main>`;
  return htmlPage({ title: 'Problem reports', body, siteOrigins: allowedOrigins(env) });
}

// The service's mark: a console prompt over a log line. Same drawing as
// public/favicon.svg, here in the page's own colours.
const LOGO = `<svg class="logo" width="44" height="44" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
  <rect x="3" y="3" width="58" height="58" rx="18" fill="var(--accent)"/>
  <path d="M14 14 L24.5 24 L14 34" fill="none" stroke="var(--bg)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M35 34 H50" stroke="var(--bg)" stroke-width="7" stroke-linecap="round"/>
  <path d="M14 49 H50" stroke="var(--bg)" stroke-width="6" stroke-linecap="round" opacity="0.6"/>
</svg>`;

// Corner sigil, placed as martilama.com places its rune: this service's own
// mark (console prompt, cursor and a log line), oversized and faint, behind
// the content. Strokes only, without the logo's square.
const RUNE_MARK = `<div class="rune-mark" aria-hidden="true">
    <svg viewBox="0 0 64 64" focusable="false" preserveAspectRatio="xMidYMid meet">
      <g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 14 L24.5 24 L14 34" /><path d="M35 34 H50" />
        <path d="M14 49 H50" />
      </g>
    </svg>
  </div>`;

// The same sun and moon toggle as martilama.com.
const THEME_TOGGLE = `<button type="button" class="theme-toggle" id="theme-toggle" aria-label="Switch between light and dark" title="Switch between light and dark">
        <svg class="toggle-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <mask id="moon-mask">
            <rect x="0" y="0" width="24" height="24" fill="white" />
            <circle class="moon-dot" cx="24" cy="10" r="6" fill="black" />
          </mask>
          <circle class="sun" cx="12" cy="12" r="6" fill="currentColor" mask="url(#moon-mask)" />
          <g class="rays" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
            <line x1="12" y1="1.5" x2="12" y2="3.5" /><line x1="12" y1="20.5" x2="12" y2="22.5" />
            <line x1="1.5" y1="12" x2="3.5" y2="12" /><line x1="20.5" y1="12" x2="22.5" y2="12" />
            <line x1="4.2" y1="4.2" x2="5.6" y2="5.6" /><line x1="18.4" y1="18.4" x2="19.8" y2="19.8" />
            <line x1="4.2" y1="19.8" x2="5.6" y2="18.4" /><line x1="18.4" y1="5.6" x2="19.8" y2="4.2" />
          </g>
        </svg>
      </button>`;

const FILTERS = [['error', 'Errors'], ['warning', 'Warnings'], ['log', 'Logs'], ['nav', 'Navigation'], ['click', 'Clicks'], ['key', 'Keys']];

async function reportPage(env, id) {
  const m = await readMeta(env, id);
  if (!m) return notFound(env);
  const ids = await listIds(env);
  const at = ids.indexOf(id);
  const step = (elId, target, label) => (target
    ? `<a id="${elId}" href="/r/${esc(target)}" class="btn">${label}</a>`
    : `<span class="btn off" aria-disabled="true">${label}</span>`);
  const position = at === -1 ? '' : `<span class="pos">${at + 1} of ${ids.length}</span>`;
  const filters = FILTERS.map(([key, label]) =>
    `<button type="button" class="btn" data-filter="${key}" aria-pressed="true">${label} <span class="n"></span></button>`).join('');
  const body = `<main class="report" id="report" data-id="${esc(m.id)}" data-vw="${esc(m.viewport.width)}" data-vh="${esc(m.viewport.height)}">
  <header class="site-header compact">
    <p class="brand"><a href="/" title="All reports">
      ${LOGO}
      <span class="name">martilama</span>
      <span class="what">problem reports</span>
    </a></p>
    <h1 class="when">${esc(fmtDate(m.receivedAt))}</h1>
    <nav>
      ${position}
      ${step('newer', at > 0 ? ids[at - 1] : null, 'Newer')}
      ${step('older', at !== -1 ? ids[at + 1] : null, 'Older')}
      <button type="button" id="delete" class="btn danger">Delete report</button>
      ${THEME_TOGGLE}
    </nav>
  </header>
  <div class="top">
    <details id="details" class="more">
      <summary class="btn">Details</summary>
      <dl class="facts">
        <div><dt>Received</dt><dd>${esc(fmtDate(m.receivedAt))}</dd></div>
        <div><dt>Page</dt><dd>${esc(m.url)}</dd></div>
        <div><dt>Length</dt><dd>${esc(fmtDuration(m.endedAt - m.startedAt))}</dd></div>
        <div><dt>Window</dt><dd>${esc(m.viewport.width)} × ${esc(m.viewport.height)}</dd></div>
        <div><dt>Browser</dt><dd>${esc(m.userAgent)}</dd></div>
      </dl>
    </details>
  </div>
  <div class="stage">
    <div class="main">
      <div id="player" title="Click the replay to play or pause"></div>
      <p class="note" id="note">${esc(m.note) || '<em>The visitor left no note.</em>'}</p>
      <p class="keys"><kbd>Space</kbd> play or pause <kbd>←</kbd> <kbd>→</kbd> previous or next entry <kbd>Shift</kbd> <kbd>←</kbd> <kbd>→</kbd> newer or older report <span class="alt">also K J and [ ]</span></p>
    </div>
    <div id="divider" class="divider" role="separator" aria-orientation="vertical" tabindex="0" aria-label="Resize replay and console" title="Drag to resize. Double-click to reset."></div>
    <aside class="side">
      <div id="filters" class="filters">${filters}</div>
      <ol id="log" class="log"></ol>
    </aside>
  </div>
</main>
<link rel="stylesheet" href="/vendor/rrweb-player.min.css">
<link rel="stylesheet" href="/viewer.css">
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
