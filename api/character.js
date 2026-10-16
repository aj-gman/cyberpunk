// /api/character.js
//
// Serverless proxy between the character sheet (browser) and the GitHub
// Contents API. The GitHub token lives only in the Vercel environment
// variable GITHUB_TOKEN — it is never sent to or stored in the browser.
//
// GET  /api/character?id=HEX          -> loads characters/hex.json
// POST /api/character { id, data }    -> saves/updates characters/hex.json
//
// Repo / branch / folder are not secrets, so they're hardcoded below.
// Change them here if the repo, branch, or folder ever changes.

const GITHUB_OWNER = 'aj-gman';
const GITHUB_REPO = 'cyberpunk';
const GITHUB_BRANCH = 'main';
const GITHUB_FOLDER = 'characters';

function slugify(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || '';
}

function ghHeaders(token) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'nco-character-sheet-proxy'
  };
}

function contentsUrl(path) {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
}

export default async function handler(req, res) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Server missing GITHUB_TOKEN env var.' });
  }

  // Sheet and API are served from the same Vercel deployment, but keep this
  // permissive in case the sheet is ever embedded/proxied elsewhere.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    if (req.method === 'GET') {
      const idRaw = req.query.id;
      const id = slugify(Array.isArray(idRaw) ? idRaw[0] : idRaw);
      if (!id) return res.status(400).json({ error: 'Missing character id' });

      const filePath = `${GITHUB_FOLDER}/${id}.json`;
      const ghRes = await fetch(
        `${contentsUrl(filePath)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`,
        { headers: ghHeaders(token) }
      );

      if (ghRes.status === 404) {
        return res.status(404).json({ error: `No save found for "${id}"` });
      }
      if (!ghRes.ok) {
        const err = await ghRes.json().catch(() => ({}));
        return res.status(ghRes.status).json({ error: err.message || `GitHub error ${ghRes.status}` });
      }

      const file = await ghRes.json();
      const jsonStr = Buffer.from(file.content, 'base64').toString('utf-8');
      let data;
      try {
        data = JSON.parse(jsonStr);
      } catch (e) {
        return res.status(500).json({ error: 'Saved file is not valid JSON.' });
      }
      return res.status(200).json({ id, data });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const id = slugify(body.id);
      const data = body.data;
      if (!id) return res.status(400).json({ error: 'Missing character id' });
      if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Missing character data' });

      const filePath = `${GITHUB_FOLDER}/${id}.json`;

      // Look up the existing file's sha (required by GitHub to update a file).
      let sha;
      const getRes = await fetch(
        `${contentsUrl(filePath)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`,
        { headers: ghHeaders(token) }
      );
      if (getRes.status === 200) {
        const existing = await getRes.json();
        sha = existing.sha;
      } else if (getRes.status !== 404) {
        const err = await getRes.json().catch(() => ({}));
        return res.status(getRes.status).json({ error: err.message || `GitHub error ${getRes.status}` });
      }

      const contentB64 = Buffer.from(JSON.stringify(data, null, 2), 'utf-8').toString('base64');
      const putBody = {
        message: `${sha ? 'Update' : 'Add'} character: ${id}`,
        content: contentB64,
        branch: GITHUB_BRANCH,
        ...(sha ? { sha } : {})
      };

      const putRes = await fetch(contentsUrl(filePath), {
        method: 'PUT',
        headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(putBody)
      });

      if (!putRes.ok) {
        const err = await putRes.json().catch(() => ({}));
        return res.status(putRes.status).json({ error: err.message || `GitHub error ${putRes.status}` });
      }

      return res.status(200).json({ ok: true, id });
    }

    res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unexpected server error' });
  }
}
