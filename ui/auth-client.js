// Talks to the RVAI account endpoints (/api/auth/*, see src/auth.ts). The session lives in an HttpOnly
// cookie, so the page never sees a token: it asks /api/auth/me who is signed in.
export const displayName = user => (user?.name || user?.email?.split('@')[0] || '').trim();

export async function authRequest(action, body) {
  const res = await fetch(`/api/auth/${action}`, body === undefined && action === 'me'
    ? { credentials: 'same-origin' }
    : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}

// Resolves to the signed-in user, or null when signed out or the backend isn't reachable (static preview).
export const currentUser = () => authRequest('me').then(d => d.user || null, () => null);
