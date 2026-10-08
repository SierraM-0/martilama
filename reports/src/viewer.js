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
  <header class="masthead">
    ${LOGO}
    <h1>martilama <span>problem reports</span></h1>
  </header>
  ${metas.length ? table : '<p class="empty">No reports yet.</p>'}
</main>`;
  return htmlPage({ title: 'Problem reports', body, siteOrigins: allowedOrigins(env) });
}

// The site's Mannaz mark, as on martilama.com.
const LOGO = `<svg class="logo" width="40" height="40" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="58" height="58" rx="18" fill="var(--accent)" />
      <g fill="none" stroke="var(--bg)" stroke-width="5" stroke-linecap="round">
        <path d="M21 19 V45" /><path d="M43 19 V45" /><path d="M21 22 L43 34" /><path d="M43 22 L21 34" />
      </g>
    </svg>`;

const FILTERS = [['error', 'Errors'], ['warning', 'Warnings'], ['log', 'Logs'], ['nav', 'Navigation']];

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
  <header class="top">
    <div class="bar">
      <a class="btn back" href="/">← All reports</a>
      <h1 class="when">${esc(fmtDate(m.receivedAt))}</h1>
      ${position}
      ${step('newer', at > 0 ? ids[at - 1] : null, 'Newer')}
      ${step('older', at !== -1 ? ids[at + 1] : null, 'Older')}
      <button type="button" id="delete" class="btn danger">Delete report</button>
    </div>
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
  </header>
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
