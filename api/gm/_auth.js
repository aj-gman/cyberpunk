// Shared owner-passphrase auth for the GM screen (server side only).
// GM_PASSHASH  = scrypt$N$r$p$saltHex$hashHex   (never the passphrase itself)
// GM_SESSION_KEY = random secret used to sign the session cookie.
const crypto = require('crypto');

const COOKIE = 'gm_session';
const SESSION_SECONDS = 7 * 24 * 3600;

function parseHash(s) {
  const p = String(s || '').split('$');
  if (p.length !== 6 || p[0] !== 'scrypt') return null;
  const [, N, r, pp, salt, hash] = p;
  return { N: +N, r: +r, p: +pp, salt: Buffer.from(salt, 'hex'), hash: Buffer.from(hash, 'hex') };
}

function verifyPassphrase(passphrase, stored) {
  const h = parseHash(stored);
  if (!h || typeof passphrase !== 'string' || !passphrase || passphrase.length > 512) return false;
  const attempt = crypto.scryptSync(passphrase, h.salt, h.hash.length,
    { N: h.N, r: h.r, p: h.p, maxmem: 256 * h.N * h.r });
  return attempt.length === h.hash.length && crypto.timingSafeEqual(attempt, h.hash);
}

const sign = (data, key) => crypto.createHmac('sha256', key).update(data).digest('base64url');

function makeSession(key, now = Date.now()) {
  const exp = Math.floor(now / 1000) + SESSION_SECONDS;
  const nonce = crypto.randomBytes(8).toString('hex');
  const body = `${exp}.${nonce}`;
  return `${body}.${sign(body, key)}`;
}

function checkSession(token, key, now = Date.now()) {
  if (!key || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const body = `${parts[0]}.${parts[1]}`;
  const good = Buffer.from(sign(body, key));
  const got = Buffer.from(parts[2]);
  if (good.length !== got.length || !crypto.timingSafeEqual(good, got)) return false;
  return Number(parts[0]) > Math.floor(now / 1000);
}

function readCookie(req, name = COOKIE) {
  const m = String(req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(name + '='));
  return m ? m.slice(name.length + 1) : '';
}

const cookieHeader = (token, maxAge = SESSION_SECONDS) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

const isAuthed = (req) => checkSession(readCookie(req), process.env.GM_SESSION_KEY);

module.exports = { verifyPassphrase, makeSession, checkSession, readCookie, cookieHeader, isAuthed, COOKIE, SESSION_SECONDS };
