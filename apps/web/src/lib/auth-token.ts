/**
 * The session token lives in localStorage so it survives reloads and is shared by every tab.
 *
 * Trade-off, stated plainly: unlike an HttpOnly cookie, script running on this page can read it, so an XSS bug
 * would expose it. Mitigations here: the token is opaque, expires server-side, and is revoked on logout; React
 * escapes everything we render (no raw HTML is ever injected); and the app loads no third-party scripts.
 * What it buys: it works across any two domains (e.g. Vercel + Render) with no third-party-cookie problem.
 *
 * Storage can throw (private mode, blocked site data), so every access is guarded and an in-memory copy is the
 * fallback: the app still works for the life of the tab.
 */
const KEY = "gridboard.token";
let memory: string | null = null;

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

export function setToken(token: string): void {
  memory = token;
  try {
    localStorage.setItem(KEY, token);
  } catch {
    /* in-memory copy still works for this tab */
  }
}

export function clearToken(): void {
  memory = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
