// ASG shared-password check. The ONLY ASG traffic on Vercel: it verifies the
// group password (scrypt hash in ASG_PASSHASH, same format as the GM screen)
// and mints a short-lived HMAC token. All spreadsheet reads/writes go
// straight from the browser to the Apps Script web app, which verifies this
// token with the same ASG_TOKEN_KEY (Script Properties).
//
// Env: ASG_PASSHASH  = scrypt$N$r$p$saltHex$hashHex (never the password)
//      ASG_TOKEN_KEY = random secret shared with the Apps Script project
//      ASG_ALLOWED_ORIGIN = page origin allowed to call this (default below)
const crypto = require('crypto');
const { verifyPassphrase } = require('./gm/_auth');

const DEFAULT_ORIGIN = 'https://aj-gman.github.io';
const TOKEN_SECONDS = 12 * 3600; // covers the 17:30-00:00 play window; the page re-mints silently on expiry

// Best-effort only (per warm instance; an attacker rotating across cold
// instances bypasses it, so a strong password is still required - see the
// setup doc). Bounded: expired entries are pruned and the map is capped.
const fails = new Map();
const FAILS_MAX = 500;

function failsGet(ip) {
  return fails.get(ip) || null;
}

function failsSet(ip, f) {
  if (fails.size >= FAILS_MAX && !fails.has(ip)) {
    const now = Date.now();
    for (const [k, v] of fails) { // oldest-first (Map keeps insertion order)
      if (now < v.until && fails.size >= FAILS_MAX) continue;
      fails.delete(k);
      if (fails.size < FAILS_MAX) break;
    }
    if (fails.size >= FAILS_MAX) fails.delete(fails.keys().next().value);
  }
  fails.set(ip, f);
}

// On Vercel the platform overwrites x-forwarded-for with the real client IP
// and does not forward client-supplied values (anti-spoofing):
// https://vercel.com/docs/edge-network/headers/request-headers
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}

function sign(data, key) {
  return crypto.createHmac('sha256', key).update(data).digest('base64url');
}

function makeToken(key, now = Date.now()) {
  const exp = Math.floor(now / 1000) + TOKEN_SECONDS;
  const nonce = crypto.randomBytes(8).toString('hex');
  const body = `${exp}.${nonce}`;
  return { token: `${body}.${sign(body, key)}`, expiresAt: exp * 1000 };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const allowed = process.env.ASG_ALLOWED_ORIGIN || DEFAULT_ORIGIN;
  const origin = req.headers.origin;
  // CORS: answer only for the sheet's origin (GitHub Pages); no credentials.
  if (origin && origin === allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!origin || origin !== allowed) return res.status(403).json({ error: 'Forbidden' });
  if (!process.env.ASG_PASSHASH || !process.env.ASG_TOKEN_KEY) return res.status(503).json({ error: 'Not configured' });
  const ip = clientIp(req);
  const f = failsGet(ip) || { n: 0, until: 0 };
  if (Date.now() < f.until) {
    const wait = Math.max(1, Math.ceil((f.until - Date.now()) / 1000));
    res.setHeader('Retry-After', String(wait));
    return res.status(429).json({ error: 'rate_limited', retryAfterSec: wait });
  }
  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body || {};
  if (verifyPassphrase(body.password, process.env.ASG_PASSHASH)) {
    fails.delete(ip);
    return res.status(200).json({ ok: true, ...makeToken(process.env.ASG_TOKEN_KEY) });
  }
  f.n += 1; f.until = Date.now() + Math.min(60000, 1000 * 2 ** f.n);
  failsSet(ip, f);
  return res.status(401).json({ error: 'Access denied' });
};

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
module.exports.makeToken = makeToken;
module.exports.TOKEN_SECONDS = TOKEN_SECONDS;
module.exports.FAILS_MAX = FAILS_MAX;
module.exports.fails = fails;
module.exports.clientIp = clientIp;
