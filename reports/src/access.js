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
