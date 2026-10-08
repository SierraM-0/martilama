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
    `font-src 'self' data: ${sites}`,
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
