// api/load-character.js — Vercel Serverless Function
// Loads a character JSON from the GitHub repo, verifying the hashed password.

const crypto = require('crypto');
const GITHUB_OWNER = 'aj-gman';
const GITHUB_REPO = 'cyberpunk';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Missing username or password.' });
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  if (!GITHUB_TOKEN) {
    return res.status(500).json({ error: 'Server misconfiguration: missing GITHUB_TOKEN.' });
  }

  const SALT   = 'cyberpunk-red-salt-2077-night-city';
  const hashHex = crypto.createHash('sha256').update(password + SALT).digest('hex');

  const safeUsername = username.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 64);
  const filePath = `saves/characters/${safeUsername}.json`;

  try {
    const ghRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'CyberpunkRed-CharacterSheet/1.0',
        },
      }
    );

    if (!ghRes.ok) {
      if (ghRes.status === 404) {
        return res.status(404).json({ error: `No character found for callsign "${safeUsername}".` });
      }
      return res.status(500).json({ error: 'Matrix connection failed.' });
    }

    const fileData = await ghRes.json();
    const decoded  = Buffer.from(fileData.content.replace(/\n/g, ''), 'base64').toString('utf8');
    const saveData = JSON.parse(decoded);

    if (saveData.passwordHash !== hashHex) {
      return res.status(401).json({ error: 'Access denied — incorrect access code.' });
    }

    return res.status(200).json({
      success: true,
      characterData: saveData.characterData,
      lastSaved: saveData.lastSaved,
    });

  } catch (e) {
    console.error('Load error:', e);
    return res.status(500).json({ error: 'Matrix error.', details: e.message });
  }
};
