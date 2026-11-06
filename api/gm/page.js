// GET: the GM screen HTML only with a valid session; otherwise a login form.
// The GM page source lives in api/gm/_gm.html (bundled into this function, not in public/ or Pages).
const fs = require('fs');
const path = require('path');
const { isAuthed } = require('./_auth');
const LOGIN = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>GM</title>
<body style="background:#07070c;color:#fee801;font:16px monospace;display:grid;place-items:center;height:100vh;margin:0">
<form id=f><p>GM ACCESS</p><input id=p type=password autocomplete=current-password style="background:#000;color:#fff;border:1px solid #54c1e6;padding:6px">
<button style="background:#000;color:#54c1e6;border:1px solid #54c1e6;padding:6px 12px">ENTER</button><p id=m style="color:#ff0055"></p></form>
<script>f.onsubmit=async e=>{e.preventDefault();const r=await fetch('/api/gm/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({passphrase:p.value})});r.ok?location.reload():m.textContent=r.status==429?'Too many attempts':'Access denied'}</script>`;
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' https://aj-gman.github.io; frame-src https://aj-gman.github.io; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!isAuthed(req)) return res.status(401).send(LOGIN);
  res.status(200).send(fs.readFileSync(path.join(__dirname, '_gm.html'), 'utf8'));
};
