import type {
  ActivityDTO, ApiErrorBody, CellDetailDTO, ClaimResultDTO, ErrorCode, GridDTO, JoinRequest,
  LeaderboardDTO, BoardStatsDTO, JoinResultDTO, SessionDTO,
} from "@gridboard/shared";
import { clearToken, getToken, setToken } from "@/lib/auth-token";

// Public, non-secret: the browser needs to know where the API lives.
export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | "NETWORK_ERROR",
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? "GET";
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1${path}`, {
      method,
      // Bearer token, not a cookie: nothing is attached automatically, so there is no CSRF surface and it works
      // across domains. No `credentials` option is needed.
      headers: {
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Can't reach the server.");
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => null)) as { data?: T } & Partial<ApiErrorBody> | null;
  if (!res.ok || !json || json.data === undefined) {
    // A token the server no longer accepts (expired or revoked) is useless: forget it so we show the join screen.
    if (res.status === 401 && token) clearToken();
    const e = json?.error;
    throw new ApiError(res.status, e?.code ?? "INTERNAL_ERROR", e?.message ?? "Unexpected server response.", e?.details);
  }
  return json.data;
}

export const api = {
  join: async (body: JoinRequest): Promise<SessionDTO> => {
    const { token, expiresAt: _expiresAt, ...session } = await request<JoinResultDTO>("/users/join", { method: "POST", body });
    setToken(token);
    return session;
  },
  me: () => request<SessionDTO>("/users/me"),
  logout: async () => {
    try {
      await request<void>("/users/logout", { method: "POST" }); // revokes the session server-side
    } finally {
      clearToken(); // even if the request failed, this device must stop using the token
    }
  },
  grid: () => request<GridDTO>("/grid"),
  cell: (id: number) => request<CellDetailDTO>(`/cells/${id}`),
  claim: (id: number) => request<ClaimResultDTO>(`/cells/${id}/claim`, { method: "POST" }),
  leaderboard: () => request<LeaderboardDTO>("/leaderboard"),
  stats: () => request<BoardStatsDTO>("/stats"),
  activity: () => request<ActivityDTO[]>("/activity?limit=40"),
};
