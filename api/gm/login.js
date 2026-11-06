// POST {passphrase} -> sets the signed session cookie. No CORS headers on purpose.
const { verifyPassphrase, makeSession, cookieHeader } = require('./_auth');
// Best-effort only (per instance). The real limit is a Vercel WAF rate-limit rule.
const fails = new Map();

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.GM_PASSHASH || !process.env.GM_SESSION_KEY) return res.status(503).json({ error: 'Not configured' });
  // Same-origin only: reject cross-site POSTs (login CSRF). Sec-Fetch-Site/Origin are set by browsers.
  const origin = req.headers.origin, host = req.headers.host;
  if (req.headers['sec-fetch-site'] === 'cross-site' || (origin && host && new URL(origin).host !== host)) return res.status(403).json({ error: 'Forbidden' });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const f = fails.get(ip) || { n: 0, until: 0 };
  if (Date.now() < f.until) return res.status(429).json({ error: 'Too many attempts' });
  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body || {};
  if (verifyPassphrase(body.passphrase, process.env.GM_PASSHASH)) {
    fails.delete(ip);
    res.setHeader('Set-Cookie', cookieHeader(makeSession(process.env.GM_SESSION_KEY)));
    return res.status(200).json({ ok: true });
  }
  f.n += 1; f.until = Date.now() + Math.min(60000, 1000 * 2 ** f.n); fails.set(ip, f);
  return res.status(401).json({ error: 'Access denied' });
};
function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
