// Pages Function backing /ff/api/profile on the hosted trevor-apps bundle.
//
// The FF login: one profile per Cloudflare Access identity, so signing up once
// with a Sleeper username follows the person to every device they open the app
// on. Stored in the bundle's D1 database (binding DB) in its own table.
//
//   GET    -> 200 {sleeper:[{user_id, username}], espn:[{league_id, season, team_id}], updated_at} or null
//   PUT    {sleeper:[...], espn:[...]} -> 200 {ok, updated_at}   (espn optional)
//   DELETE -> 200 {ok}
//
// Identity comes from the Access JWT, verified here rather than trusted from a
// header, so a request that skipped Access cannot claim someone else's email.
// Maintained in Fantasy Football/cloudflare/ and merge-copied into the shared
// functions root by .agents/scripts/deploy-phone-apps.ps1.

const TEAM = 'https://damp-breeze-a843.cloudflareaccess.com';
// The trevor-apps Access application, read from its login redirect on 2026-10-09.
// Pinning it stops a token minted by another app in the team being replayed here.
const AUD = '523ac8bb413c7b6afea53c172776babeb24183f245144278f9b7cc17f4a883a3';
const MAX_USERS = 8;
let certs = [], certsAt = 0;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});
const b64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
const part = s => JSON.parse(new TextDecoder().decode(b64(s)));

export async function identity(request, fetchFn = fetch, now = Date.now(), aud = AUD) {
  const cookie = (request.headers.get('cookie') || '').match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  const token = request.headers.get('cf-access-jwt-assertion') || cookie?.[1];
  if (!token) return null;
  try {
    const [h, p, s] = token.split('.');
    const header = part(h), payload = part(p);
    if (header.alg !== 'RS256' || payload.iss !== TEAM || !(payload.exp * 1000 > now) || !payload.email) return null;
    if (![].concat(payload.aud).includes(aud)) return null;
    let jwk = certs.find(k => k.kid === header.kid);
    if (!jwk && now - certsAt > 60000) {   // keys rotate; refetch at most once a minute
      certsAt = now;
      const keys = (await (await fetchFn(`${TEAM}/cdn-cgi/access/certs`)).json()).keys;
      if (Array.isArray(keys) && keys.length) certs = keys;
      jwk = certs.find(k => k.kid === header.kid);
    }
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64(s), new TextEncoder().encode(`${h}.${p}`));
    return ok ? String(payload.email).toLowerCase() : null;
  } catch { return null; }
}

export function clean(body) {
  const list = body && Array.isArray(body.sleeper) ? body.sleeper : null;
  if (!list || !list.length || list.length > MAX_USERS) return null;
  const out = [];
  for (const u of list) {
    const user_id = String(u?.user_id || ''), username = String(u?.username || '');
    if (!/^\d{1,24}$/.test(user_id) || !/^[A-Za-z0-9_.-]{1,40}$/.test(username)) return null;
    if (!out.some(x => x.user_id === user_id)) out.push({ user_id, username });
  }
  const espn = body.espn === undefined ? [] : body.espn;
  if (!Array.isArray(espn) || espn.length > MAX_USERS) return null;
  const leagues = [];
  for (const l of espn) {
    const league_id = String(l?.league_id ?? ''), season = String(l?.season ?? ''), team_id = String(l?.team_id ?? '');
    if (!/^\d{1,12}$/.test(league_id) || !/^20\d{2}$/.test(season) || !/^\d{1,4}$/.test(team_id)) return null;
    if (!leagues.some(x => x.league_id === league_id)) leagues.push({ league_id, season, team_id });
  }
  return { sleeper: out, espn: leagues };
}

async function table(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS ff_profiles (email TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)').run();
}

export async function onRequest({ request, env }) {
  const email = await identity(request);
  if (!email) return json({ error: 'Sign in through Cloudflare Access first' }, 401);
  await table(env.DB);
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT data, updated_at FROM ff_profiles WHERE email = ?').bind(email).first();
    return json(row ? { ...JSON.parse(row.data), updated_at: row.updated_at } : null);
  }
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM ff_profiles WHERE email = ?').bind(email).run();
    return json({ ok: true });
  }
  if (request.method === 'PUT') {
    const text = await request.text();
    if (text.length > 4096) return json({ error: 'Profile too large' }, 413);
    let profile;
    try { profile = clean(JSON.parse(text)); } catch { profile = null; }
    if (!profile) return json({ error: `Expected {sleeper:[{user_id, username}], espn:[{league_id, season, team_id}]}, 1 to ${MAX_USERS} users, up to ${MAX_USERS} leagues` }, 400);
    const updated_at = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO ff_profiles (email, data, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
      .bind(email, JSON.stringify(profile), updated_at).run();
    return json({ ok: true, updated_at });
  }
  return json({ error: 'Method not allowed' }, 405);
}
