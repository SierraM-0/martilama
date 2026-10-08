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
