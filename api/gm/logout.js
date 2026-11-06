const { cookieHeader } = require('./_auth');
module.exports = (req, res) => { res.setHeader('Set-Cookie', cookieHeader('', 0)); res.status(200).json({ ok: true }); };
