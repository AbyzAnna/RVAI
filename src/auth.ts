import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Accounts for the web app. Supabase Auth stores users and hashes passwords; RVAI keeps the signed-in
 * user in its own signed, HttpOnly session cookie so pages only need GET /api/auth/me to know who is here.
 * Shared by the local server (src/server.ts) and the Vercel function (api/auth/[action].js).
 */
export type AuthEnv = Record<string, string | undefined>;
export type User = { id: string; email: string; name: string };
export type AuthReply = { status: number; body: unknown; cookie?: string };

const COOKIE = "rvai_session";
const MAX_AGE = 60 * 60 * 24 * 7; // one week
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const ACTIONS = ["signup", "login", "logout", "me"] as const;

type Config = { url: string; anon: string; service: string; secret: string; secure: boolean };

function config(env: AuthEnv): Config | null {
  const url = env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const anon = env.SUPABASE_ANON_KEY?.trim();
  const service = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const secret = env.AUTH_SECRET?.trim();
  if (!url || !anon || !service || !secret) return null;
  return { url, anon, service, secret, secure: Boolean(env.VERCEL) };
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (data: string, secret: string) => createHmac("sha256", secret).update(data).digest("base64url");

export function makeSession(user: User, secret: string, now = Date.now()): string {
  const data = b64(JSON.stringify({ ...user, exp: Math.floor(now / 1000) + MAX_AGE }));
  return `${data}.${sign(data, secret)}`;
}

export function readSession(cookieHeader: string | undefined, secret: string, now = Date.now()): User | null {
  const raw = (cookieHeader ?? "").split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const [data, mac] = (raw ?? "").split(".");
  if (!data || !mac) return null;
  const want = Buffer.from(sign(data, secret)), got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const s = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (typeof s.exp !== "number" || s.exp * 1000 < now) return null;
    return { id: String(s.id), email: String(s.email), name: String(s.name ?? "") };
  } catch {
    return null;
  }
}

const cookie = (value: string, maxAge: number, secure: boolean) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;

const toUser = (u: { id?: string; email?: string; user_metadata?: { name?: string } }): User => ({
  id: String(u.id), email: String(u.email), name: String(u.user_metadata?.name ?? ""),
});

function fields(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    email: typeof b.email === "string" ? b.email.trim().toLowerCase().slice(0, 200) : "",
    password: typeof b.password === "string" ? b.password.slice(0, 200) : "",
    name: typeof b.name === "string" ? b.name.trim().slice(0, 60) : "",
  };
}

export type AuthRequest = { action: string; method: string; body?: unknown; cookie?: string };

export async function handleAuth(req: AuthRequest, env: AuthEnv, fetchImpl: typeof fetch = fetch): Promise<AuthReply> {
  const cfg = config(env);
  if (req.action === "me") return { status: 200, body: { user: cfg ? readSession(req.cookie, cfg.secret) : null, enabled: Boolean(cfg) } };
  if (req.method !== "POST") return { status: 405, body: { error: "use POST" } };
  if (req.action === "logout") return { status: 200, body: { user: null }, cookie: cookie("", 0, cfg?.secure ?? false) };
  if (!cfg) return { status: 503, body: { error: "Accounts aren't set up on this server yet." } };

  const { email, password, name } = fields(req.body);
  if (!EMAIL_RE.test(email)) return { status: 400, body: { error: "Enter a valid email address." } };
  const signIn = (user: User): AuthReply => ({ status: 200, body: { user }, cookie: cookie(makeSession(user, cfg.secret), MAX_AGE, cfg.secure) });

  if (req.action === "signup") {
    if (password.length < 8) return { status: 400, body: { error: "Use a password with at least 8 characters." } };
    // Admin create with email_confirm: the account works right away, no confirmation email to wait for.
    const res = await fetchImpl(`${cfg.url}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: cfg.service, Authorization: `Bearer ${cfg.service}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name } }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) return signIn(toUser(data));
    const msg = String(data.msg ?? data.message ?? data.error_description ?? "");
    if (res.status === 422 && /already|exists|registered/i.test(msg + String(data.error_code ?? ""))) {
      return { status: 409, body: { error: "An account with this email already exists. Log in instead." } };
    }
    if (res.status === 422 || res.status === 400) return { status: 400, body: { error: msg || "Couldn't create that account." } };
    return { status: 502, body: { error: "Sign up is unavailable right now. Try again in a moment." } };
  }

  if (req.action === "login") {
    if (!password) return { status: 400, body: { error: "Enter your password." } };
    const res = await fetchImpl(`${cfg.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: cfg.anon, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = (await res.json().catch(() => ({}))) as { user?: Parameters<typeof toUser>[0] };
    if (res.ok && data.user) return signIn(toUser(data.user));
    if (res.status === 400 || res.status === 401) return { status: 401, body: { error: "Wrong email or password." } };
    return { status: 502, body: { error: "Log in is unavailable right now. Try again in a moment." } };
  }

  return { status: 404, body: { error: "not found" } };
}
