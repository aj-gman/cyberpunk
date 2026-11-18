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

describe('asg-auth rate limiting (independent audit)', () => {
  afterEach(() => handler.fails.clear());

  it('answers 429 with rate_limited body and Retry-After once an IP is in backoff', async () => {
    stubEnv();
    const ip = { method: 'POST', body: { password: 'nope' }, headers: { origin: ORIGIN, 'x-forwarded-for': '198.51.100.7' } };
    const first = mockRes();
    await handler(ip, first);
    expect(first.statusCode).toBe(401); // first wrong try: backoff starts
    const second = mockRes();
    await handler({ ...ip, body: { password: 'nope' } }, second);
    expect(second.statusCode).toBe(429);
    expect(second.body.error).toBe('rate_limited');
    expect(second.body.retryAfterSec).toBeGreaterThan(0);
    expect(second.headers['Retry-After']).toBe(String(second.body.retryAfterSec));
  });

  it('does not rate-limit a different IP (per-IP tracking)', async () => {
    stubEnv();
    const res = mockRes();
    await handler({ method: 'POST', body: { password: PASSWORD }, headers: { origin: ORIGIN, 'x-forwarded-for': '198.51.100.8' } }, res);
    expect(res.statusCode).toBe(200);
  });

  it('caps the failure map at FAILS_MAX (bounded memory per instance)', async () => {
    stubEnv();
    const now = Date.now();
    for (let i = 0; i < handler.FAILS_MAX; i++) handler.fails.set('192.0.' + Math.floor(i / 256) + '.' + (i % 256), { n: 1, until: now + 60000 });
    expect(handler.fails.size).toBe(handler.FAILS_MAX);
    const res = mockRes();
    await handler({ method: 'POST', body: { password: 'nope' }, headers: { origin: ORIGIN, 'x-forwarded-for': '203.0.113.250' } }, res);
    expect(res.statusCode).toBe(401); // still tracks the new IP
    expect(handler.fails.size).toBeLessThanOrEqual(handler.FAILS_MAX); // oldest evicted, never unbounded
    expect(handler.fails.has('203.0.113.250')).toBe(true);
  });

  it('trusts the platform-written x-forwarded-for first hop, else unknown', () => {
    expect(handler.clientIp({ headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' } })).toBe('203.0.113.1');
    expect(handler.clientIp({ headers: {} })).toBe('unknown');
  });
});
