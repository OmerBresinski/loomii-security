const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000"

const SESSION_KEY = "loomii:session"

// ─── Session Storage ────────────────────────────────────────────────────────

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

export function setSessionToken(token: string): void {
  try {
    localStorage.setItem(SESSION_KEY, token)
  } catch {
    // localStorage unavailable (private browsing, etc.)
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // noop
  }
}

// ─── API Error ──────────────────────────────────────────────────────────────

export class ApiError extends Error {
  public status: number
  public code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
  }
}

// ─── Typed Fetch ────────────────────────────────────────────────────────────

interface FetchApiOptions extends Omit<RequestInit, "body"> {
  body?: unknown
  /** Skip auth header injection (for public endpoints like /auth/exchange) */
  skipAuth?: boolean
}

/**
 * Typed fetch wrapper with automatic auth header injection and 401 handling.
 * On 401 response, clears the session and redirects to /login.
 */
export async function fetchApi<T = unknown>(
  path: string,
  options: FetchApiOptions = {}
): Promise<T> {
  const { body, headers, skipAuth, ...rest } = options
  const token = getSessionToken()

  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string>),
  }

  if (!skipAuth && token) {
    requestHeaders["Authorization"] = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: requestHeaders,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
    ...rest,
  })

  if (response.status === 401) {
    clearSession()
    // Avoid redirect loops: only redirect if not already on login/auth pages
    if (
      !window.location.pathname.startsWith("/login") &&
      !window.location.pathname.startsWith("/auth")
    ) {
      window.location.href = "/login"
    }
    throw new ApiError(401, "UNAUTHORIZED", "Session expired")
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({
      error: { code: "UNKNOWN", message: response.statusText },
    }))
    throw new ApiError(
      response.status,
      errorBody.error?.code ?? "UNKNOWN",
      errorBody.error?.message ?? "Request failed"
    )
  }

  return response.json() as Promise<T>
}

// ─── Auth-specific API calls ────────────────────────────────────────────────

export interface AuthUser {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
}

export type UserRole = "ADMIN" | "SECURITY_LEAD" | "DEVELOPER" | "VIEWER"

interface ExchangeResponse {
  sessionToken: string
  user: AuthUser
  organizationId: string | null
}

interface MeResponse {
  user: AuthUser
  tenantId: string
  role: UserRole
}

/**
 * Exchange a one-time code from the auth callback for a session token.
 */
export async function exchangeAuthCode(exchangeId: string): Promise<ExchangeResponse> {
  return fetchApi<ExchangeResponse>("/auth/exchange", {
    method: "POST",
    body: { exchangeId },
    skipAuth: true,
  })
}

/**
 * Validate the current session and get user info.
 * Returns null if the session is invalid (without triggering redirect).
 */
export async function fetchCurrentUser(): Promise<MeResponse | null> {
  const token = getSessionToken()
  if (!token) return null

  try {
    return await fetchApi<MeResponse>("/api/v1/me")
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null
    }
    throw error
  }
}

/**
 * Get the login redirect URL (API handles WorkOS redirect).
 */
export function getLoginUrl(): string {
  return `${API_BASE_URL}/auth/login`
}
