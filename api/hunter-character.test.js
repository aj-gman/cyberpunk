import { describe, it, expect, vi, afterEach } from 'vitest';
import handler from './hunter-character.js';

function res() {
  const r = { code: 0, body: null, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
}
const sheet = { format: 'hunter-vigil-2e-sheet', version: 1 };

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('hunter-character api', () => {
  it('needs the server token', async () => {
    vi.stubEnv('GITHUB_TOKEN', '');
    const r = res(); await handler({ method: 'GET', query: { id: 'a' } }, r);
    expect(r.code).toBe(500);
  });
  it('rejects data that is not a Hunter sheet and never calls GitHub', async () => {
    vi.stubEnv('GITHUB_TOKEN', 't');
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    const r = res();
    await handler({ method: 'POST', body: { id: 'a', data: { format: 'nco' }, expectedRevision: null } }, r);
    expect(r.code).toBe(400); expect(f).not.toHaveBeenCalled();
  });
  it('rejects oversized data', async () => {
    vi.stubEnv('GITHUB_TOKEN', 't');
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    const r = res();
    await handler({ method: 'POST', body: { id: 'a', data: { ...sheet, pad: 'x'.repeat(800000) }, expectedRevision: null } }, r);
    expect(r.code).toBe(413); expect(f).not.toHaveBeenCalled();
  });
  it('requires a revision', async () => {
    vi.stubEnv('GITHUB_TOKEN', 't');
    const r = res(); await handler({ method: 'POST', body: { id: 'a', data: sheet } }, r);
    expect(r.code).toBe(428);
  });
  it('writes only to characters/ in the hunter repo', async () => {
    vi.stubEnv('GITHUB_TOKEN', 't');
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
      calls.push([url, opts && opts.method]);
      if (!opts || !opts.method) return { status: 404, ok: false, json: async () => ({}) };
      return { ok: true, status: 201, json: async () => ({ content: { sha: 'abc' } }) };
    }));
    const r = res();
    await handler({ method: 'POST', body: { id: '../Evil Name', data: sheet, expectedRevision: null } }, r);
    expect(r.code).toBe(200);
    expect(r.body.revision).toBe('abc');
    for (const [url] of calls) expect(url).toMatch(/^https:\/\/api\.github\.com\/repos\/aj-gman\/hunter\/contents\/characters\/[a-z0-9_-]+\.json/);
    expect(calls.some(([u]) => u.includes('..'))).toBe(false);
  });
  it('returns 409 when the revision is stale', async () => {
    vi.stubEnv('GITHUB_TOKEN', 't');
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200, ok: true, json: async () => ({ sha: 'new' }) })));
    const r = res();
    await handler({ method: 'POST', body: { id: 'a', data: sheet, expectedRevision: 'old' } }, r);
    expect(r.code).toBe(409);
  });
});
