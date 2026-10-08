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
      env: cleanEnv(m.env),
    },
  };
}

// Optional details about the visitor's setup. Each value is checked on its
// own: anything unknown or malformed is dropped rather than failing the report.
const text = (max) => (v) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : undefined);
const oneOf = (...allowed) => (v) => (allowed.includes(v) ? v : undefined);
const flag = (v) => (typeof v === 'boolean' ? v : undefined);
const ENV_FIELDS = {
  screen: (v) => (v && posInt(v.width) && posInt(v.height) ? { width: v.width, height: v.height } : undefined),
  pixelRatio: (v) => (Number.isFinite(v) && v > 0 && v <= 10 ? v : undefined),
  language: text(35),
  timezone: text(64),
  colorScheme: oneOf('light', 'dark'),
  theme: oneOf('light', 'dark'),
  pointer: oneOf('fine', 'coarse', 'none'),
  touchPoints: (v) => (Number.isInteger(v) && v >= 0 && v <= 20 ? v : undefined),
  connection: text(16),
  online: flag,
  reducedMotion: flag,
};
function cleanEnv(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out = {};
  for (const [key, check] of Object.entries(ENV_FIELDS)) {
    const value = check(raw[key]);
    if (value !== undefined) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}
