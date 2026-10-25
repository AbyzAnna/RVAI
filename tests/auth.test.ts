import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { handleAuth, makeSession, readSession } from "../src/auth.js";
import { createServer } from "../src/server.js";

const env = { SUPABASE_URL: "https://x.supabase.co/", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service", AUTH_SECRET: "s3cret" };
const user = { id: "u1", email: "ana@example.com", user_metadata: { name: "Ana" } };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const cookieOf = (setCookie: string | undefined) => setCookie?.split(";")[0] ?? "";

describe("session cookie", () => {
  it("round-trips a signed user and rejects tampering or expiry", () => {
    const value = makeSession({ id: "u1", email: "a@b.co", name: "A" }, "k");
    expect(readSession(`x=1; rvai_session=${value}`, "k")).toEqual({ id: "u1", email: "a@b.co", name: "A" });
    expect(readSession(`rvai_session=${value}`, "other-key")).toBeNull();
    expect(readSession(`rvai_session=${value.replace(/^./, "Z")}`, "k")).toBeNull();
    expect(readSession(`rvai_session=${value}`, "k", Date.now() + 8 * 864e5)).toBeNull();
    expect(readSession(undefined, "k")).toBeNull();
  });
});

describe("handleAuth", () => {
  it("signs up through the Supabase admin API with a confirmed email and starts a session", async () => {
    const fetch = vi.fn(async () => json(200, user));
    const reply = await handleAuth({ action: "signup", method: "POST", body: { email: " Ana@Example.com ", password: "longenough", name: "Ana" } }, env, fetch as typeof globalThis.fetch);
    expect(reply.status).toBe(200);
    expect(reply.body).toEqual({ user: { id: "u1", email: "ana@example.com", name: "Ana" } });
    expect(reply.cookie).toMatch(/^rvai_session=.+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=604800$/);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://x.supabase.co/auth/v1/admin/users");
    expect(JSON.parse(String(init.body))).toEqual({ email: "ana@example.com", password: "longenough", email_confirm: true, user_metadata: { name: "Ana" } });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer service");
  });

  it("validates input before calling Supabase", async () => {
    const fetch = vi.fn();
    const f = fetch as unknown as typeof globalThis.fetch;
    expect((await handleAuth({ action: "signup", method: "POST", body: { email: "nope", password: "longenough" } }, env, f)).status).toBe(400);
    expect((await handleAuth({ action: "signup", method: "POST", body: { email: "a@b.co", password: "short" } }, env, f)).status).toBe(400);
    expect((await handleAuth({ action: "login", method: "GET" }, env, f)).status).toBe(405);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports a taken email as 409", async () => {
    const fetch = async () => json(422, { code: 422, error_code: "email_exists", msg: "A user with this email address has already been registered" });
    const reply = await handleAuth({ action: "signup", method: "POST", body: { email: "a@b.co", password: "longenough" } }, env, fetch);
    expect(reply).toMatchObject({ status: 409 });
    expect(reply.cookie).toBeUndefined();
  });

  it("logs in with the password grant and maps bad credentials to 401", async () => {
    const ok = await handleAuth({ action: "login", method: "POST", body: { email: "ana@example.com", password: "pw" } }, env, async () => json(200, { access_token: "t", user }));
    expect(ok.body).toEqual({ user: { id: "u1", email: "ana@example.com", name: "Ana" } });
    const bad = await handleAuth({ action: "login", method: "POST", body: { email: "ana@example.com", password: "pw" } }, env, async () => json(400, { error: "invalid_grant" }));
    expect(bad).toEqual({ status: 401, body: { error: "Wrong email or password." } });
  });

  it("marks the cookie Secure on Vercel and clears it on logout", async () => {
    const reply = await handleAuth({ action: "logout", method: "POST" }, { ...env, VERCEL: "1" });
    expect(reply.cookie).toBe("rvai_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure");
  });

  it("says accounts are off when Supabase isn't configured", async () => {
    expect(await handleAuth({ action: "me", method: "GET" }, {})).toEqual({ status: 200, body: { user: null, enabled: false } });
    expect((await handleAuth({ action: "login", method: "POST", body: { email: "a@b.co", password: "x" } }, {})).status).toBe(503);
  });
});

describe("auth routes on the web server", () => {
  const fetch = vi.fn(async () => json(200, user));
  const server = createServer({ offline: true, env, fetch: fetch as unknown as typeof globalThis.fetch });
  let base = "";
  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("signs up, remembers the user via the cookie, then logs out", async () => {
    const signup = await globalThis.fetch(`${base}/api/auth/signup`, { method: "POST", body: JSON.stringify({ email: "ana@example.com", password: "longenough", name: "Ana" }) });
    expect(signup.status).toBe(200);
    const session = cookieOf(signup.headers.get("set-cookie") ?? undefined);
    const me = await (await globalThis.fetch(`${base}/api/auth/me`, { headers: { cookie: session } })).json();
    expect(me).toEqual({ user: { id: "u1", email: "ana@example.com", name: "Ana" }, enabled: true });
    const out = await globalThis.fetch(`${base}/api/auth/logout`, { method: "POST" });
    expect(out.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect((await globalThis.fetch(`${base}/api/auth/nope`)).status).toBe(404);
  });
});
