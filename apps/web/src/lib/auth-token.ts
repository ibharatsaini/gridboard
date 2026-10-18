
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
