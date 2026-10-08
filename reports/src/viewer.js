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
