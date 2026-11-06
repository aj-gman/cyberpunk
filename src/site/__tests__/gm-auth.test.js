import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
const a = require("../../../api/gm/_auth.js");
const mk = (pw) => { const salt = crypto.randomBytes(16); const N=2**14,r=8,p=1;
  const h = crypto.scryptSync(pw, salt, 64, { N, r, p, maxmem: 256*N*r });
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${h.toString("hex")}`; };
describe("gm auth", () => {
  const stored = mk("correct horse battery staple");
  it("accepts the right passphrase only", () => {
    expect(a.verifyPassphrase("correct horse battery staple", stored)).toBe(true);
    expect(a.verifyPassphrase("wrong", stored)).toBe(false);
    expect(a.verifyPassphrase("", stored)).toBe(false);
    expect(a.verifyPassphrase("x", "garbage")).toBe(false);
  });
  it("signs and verifies sessions, rejects tamper/expiry/wrong key", () => {
    const t = a.makeSession("k1");
    expect(a.checkSession(t, "k1")).toBe(true);
    expect(a.checkSession(t, "k2")).toBe(false);
    expect(a.checkSession(t.slice(0, -2) + "xx", "k1")).toBe(false);
    expect(a.checkSession(t, "k1", Date.now() + 8 * 24 * 3600 * 1000)).toBe(false);
    expect(a.checkSession("", "k1")).toBe(false);
    expect(a.checkSession(t, "")).toBe(false);
  });
});

describe("gm handlers", () => {
  const res = () => { const r = { h: {}, code: 0, body: null, setHeader(k, v) { r.h[k] = v; }, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; } }; return r; };
  const stored = mk("pass phrase here");
  process.env.GM_PASSHASH = stored; process.env.GM_SESSION_KEY = "key";
  const login = require("../../../api/gm/login.js"), page = require("../../../api/gm/page.js");
  it("page without cookie is 401 login form, never the tool", () => {
    const r = res(); page({ headers: {} }, r);
    expect(r.code).toBe(401); expect(r.body).not.toContain("NPC"); expect(r.h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });
  it("page with tampered or expired cookie is 401; valid cookie is 200 with tool", () => {
    const t = a.makeSession("key");
    let r = res(); page({ headers: { cookie: `gm_session=${t}x` } }, r); expect(r.code).toBe(401);
    r = res(); page({ headers: { cookie: `gm_session=${t}` } }, r); expect(r.code).toBe(200); expect(r.body).toContain("GM SCREEN");
  });
  it("login: cross-site rejected, wrong 401, right 200 with HttpOnly cookie, GET 405", async () => {
    let r = res(); await login({ method: "POST", headers: { origin: "https://evil.example", host: "x.vercel.app", "x-forwarded-for": "1.1.1.1" }, body: { passphrase: "pass phrase here" } }, r); expect(r.code).toBe(403);
    r = res(); await login({ method: "POST", headers: { host: "x", "x-forwarded-for": "2.2.2.2" }, body: { passphrase: "nope" } }, r); expect(r.code).toBe(401);
    r = res(); await login({ method: "POST", headers: { host: "x", "x-forwarded-for": "3.3.3.3" }, body: { passphrase: "pass phrase here" } }, r); expect(r.code).toBe(200);
    expect(r.h["Set-Cookie"]).toMatch(/HttpOnly; Secure; SameSite=Strict/);
    r = res(); await login({ method: "GET", headers: {} }, r); expect(r.code).toBe(405);
  });
});
