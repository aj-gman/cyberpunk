import { describe, it, expect, vi, afterEach } from 'vitest';
import crypto from 'node:crypto';
import handler from './asg-auth.js';

const PASSWORD = 'test-password';
const SALT = 'abcdef0123456789';
const HASH = crypto.scryptSync(PASSWORD, Buffer.from(SALT, 'hex'), 64).toString('hex');
const PASSHASH = `scrypt$16384$8$1$${SALT}$${HASH}`;
const TOKEN_KEY = 'test-token-key';
const ORIGIN = 'https://aj-gman.github.io';

function stubEnv() {
  vi.stubEnv('ASG_PASSHASH', PASSHASH);
  vi.stubEnv('ASG_TOKEN_KEY', TOKEN_KEY);
  vi.stubEnv('ASG_ALLOWED_ORIGIN', ORIGIN);
}

function req(body, origin = ORIGIN, method = 'POST') {
  return { method, body, headers: { origin, 'x-forwarded-for': '203.0.113.9' } };
}
function mockRes() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
    end() { return this; },
  };
}

afterEach(() => vi.unstubAllEnvs());

describe('asg-auth (Vercel password gate)', () => {
  it('mints a verifiable HMAC token for the right password', async () => {
    stubEnv();
    const res = mockRes();
    await handler(req({ password: PASSWORD }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const parts = res.body.token.split('.');
    expect(parts).toHaveLength(3);
    const expected = crypto.createHmac('sha256', TOKEN_KEY).update(`${parts[0]}.${parts[1]}`).digest('base64url');
    expect(parts[2]).toBe(expected);
    expect(Number(parts[0])).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(res.body.expiresAt).toBe(Number(parts[0]) * 1000);
    expect(res.headers['Access-Control-Allow-Origin']).toBe(ORIGIN);
  });

  it('rejects a wrong password with backoff headers absent', async () => {
    stubEnv();
    const res = mockRes();
    await handler(req({ password: 'nope' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a disallowed origin and sets no CORS header for it', async () => {
    stubEnv();
    const res = mockRes();
    await handler(req({ password: PASSWORD }, 'https://evil.example'), res);
    expect(res.statusCode).toBe(403);
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('answers the preflight for the allowed origin only', async () => {
    stubEnv();
    const res = mockRes();
    await handler(req(undefined, ORIGIN, 'OPTIONS'), res);
    expect(res.statusCode).toBe(204);
    expect(res.headers['Access-Control-Allow-Origin']).toBe(ORIGIN);
    expect(res.headers['Access-Control-Allow-Methods']).toBe('POST');
  });

  it('reports 503 when unconfigured', async () => {
    const res = mockRes();
    await handler(req({ password: PASSWORD }), res);
    expect(res.statusCode).toBe(503);
  });
});
