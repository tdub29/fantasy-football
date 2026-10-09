// node cloudflare/profile.test.mjs
import assert from 'node:assert/strict';
import { identity, clean } from './functions/ff/api/profile.js';

const TEAM = 'https://damp-breeze-a843.cloudflareaccess.com';
const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'k1' };
const certs = async () => ({ json: async () => ({ keys: [jwk] }) });
async function token(payload, kid = 'k1') {
  const head = enc({ alg: 'RS256', kid }), body = enc(payload);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${Buffer.from(sig).toString('base64url')}`;
}
const req = (t, viaCookie) => new Request('https://x/ff/api/profile', { headers: viaCookie ? { cookie: `a=1; CF_Authorization=${t}` } : { 'cf-access-jwt-assertion': t } });
const now = Date.now(), good = { iss: TEAM, aud: ['523ac8bb413c7b6afea53c172776babeb24183f245144278f9b7cc17f4a883a3'], email: 'Me@Example.com', exp: now / 1000 + 60 };

assert.equal(await identity(req(await token(good)), certs, now), 'me@example.com');
assert.equal(await identity(req(await token(good), true), certs, now), 'me@example.com', 'cookie works');
assert.equal(await identity(req(await token({ ...good, iss: 'https://evil.cloudflareaccess.com' })), certs, now), null, 'other team');
assert.equal(await identity(req(await token({ ...good, aud: ['another-app'] })), certs, now), null, 'other Access app');
assert.equal(await identity(req(await token({ ...good, exp: now / 1000 - 1 })), certs, now), null, 'expired');
const t = await token(good), [h, , s] = t.split('.');
assert.equal(await identity(req(`${h}.${enc({ ...good, email: 'other@x.com' })}.${s}`), certs, now), null, 'tampered payload');
assert.equal(await identity(req(await token(good, 'nope')), certs, now), null, 'unknown key');
assert.equal(await identity(new Request('https://x/'), certs, now), null, 'no token');

assert.deepEqual(clean({ sleeper: [{ user_id: '726629031964975104', username: 'tdub1329' }, { user_id: '726629031964975104', username: 'tdub1329' }] }),
  { sleeper: [{ user_id: '726629031964975104', username: 'tdub1329' }], espn: [] }, 'dedupes');
const me = [{ user_id: '1', username: 'u' }], lgs = n => Array.from({ length: n }, (_, i) => ({ league_id: String(100 + i), season: 2026, team_id: 3 }));
assert.deepEqual(clean({ sleeper: me, espn: lgs(1) }).espn, [{ league_id: '100', season: '2026', team_id: '3' }], 'espn kept as strings');
assert.equal(clean({ sleeper: me, espn: lgs(9) }), null, 'max 8 espn leagues');
assert.equal(clean({ sleeper: me, espn: [{ league_id: '1x', season: '2026', team_id: '1' }] }), null, 'numeric espn ids');
assert.equal(clean({ sleeper: me, espn: {} }), null, 'espn must be a list');
assert(JSON.stringify({ sleeper: Array(8).fill({ user_id: '9'.repeat(24), username: 'x'.repeat(40) }), espn: lgs(8) }).length < 4096, 'a full profile fits');
assert.equal(clean({ sleeper: [] }), null);
assert.equal(clean({ sleeper: [{ user_id: '1; drop', username: 'x' }] }), null);
assert.equal(clean({ sleeper: Array.from({ length: 9 }, (_, i) => ({ user_id: String(i + 1), username: `u${i}` })) }), null);
console.log('profile function checks passed');
