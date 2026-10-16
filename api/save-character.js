// api/save-character.js — Vercel Serverless Function
// Saves a character JSON to the GitHub repo under saves/characters/{username}.json
// Password is SHA-256 hashed (server-side) before storage — never stored in plaintext.

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

  const { username, password, characterData } = req.body;

  if (!username || !password || !characterData) {
    return res.status(400).json({ error: 'Missing required fields: username, password, characterData' });
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  if (!GITHUB_TOKEN) {
    return res.status(500).json({ error: 'Server misconfiguration: missing GITHUB_TOKEN' });
  }

  // Hash password with a fixed salt so it's never stored in plaintext
  const SALT = 'cyberpunk-red-salt-2077-night-city';
  const hashHex = crypto.createHash('sha256').update(password + SALT).digest('hex');

  // Sanitise username — letters, numbers, underscores, hyphens only
  const safeUsername = username.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 64);
  const filePath = `saves/characters/${safeUsername}.json`;

  const ghHeaders = {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'CyberpunkRed-CharacterSheet/1.0',
  };

  // ── Check whether a save already exists ──────────────────────────────────
  let existingSha  = null;
  let existingHash = null;

  try {
    const checkRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`,
      { headers: ghHeaders }
    );

    if (checkRes.ok) {
      const fileData = await checkRes.json();
      existingSha = fileData.sha;
      const decoded = Buffer.from(fileData.content.replace(/\n/g, ''), 'base64').toString('utf8');
      const existing = JSON.parse(decoded);
      existingHash = existing.passwordHash;
    }
    // 404 means it's a brand-new character — that's fine
  } catch (_) { /* ignore */ }

  // ── Verify password if save already exists ───────────────────────────────
  if (existingHash && existingHash !== hashHex) {
    return res.status(401).json({ error: 'Incorrect access code for this callsign.' });
  }

  // ── Build the save payload ────────────────────────────────────────────────
  const saveData = {
    passwordHash: hashHex,
    username: safeUsername,
    lastSaved: new Date().toISOString(),
    characterData,
  };

  const encodedContent = Buffer.from(JSON.stringify(saveData, null, 2)).toString('base64');

  const putBody = {
    message: `[sheet-save] ${safeUsername} @ ${new Date().toISOString()}`,
    content: encodedContent,
    ...(existingSha ? { sha: existingSha } : {}),
  };

  // ── Commit to GitHub ──────────────────────────────────────────────────────
  const putRes = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`,
    { method: 'PUT', headers: ghHeaders, body: JSON.stringify(putBody) }
  );

  if (putRes.ok) {
    return res.status(200).json({
      success: true,
      message: `Character "${safeUsername}" uploaded to the matrix.`,
      lastSaved: saveData.lastSaved,
    });
  } else {
    const err = await putRes.json();
    console.error('GitHub API error:', err);
    return res.status(500).json({ error: 'Matrix upload failed.', details: err.message });
  }
};
