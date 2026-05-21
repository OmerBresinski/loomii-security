import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  type AuthUser,
  type UserRole,
  clearSession,
  fetchCurrentUser,
  getLoginUrl,
  getSessionToken,
  setSessionToken,
  setStoredRole,
  exchangeAuthCode,
} from "@/lib/api-client"

// ─── Auth State ─────────────────────────────────────────────────────────────

export interface AuthState {
  user: AuthUser | null
  tenantId: string | null
  role: UserRole | null
  isAuthenticated: boolean
  isLoading: boolean
  login: () => void
  logout: () => void
}

const defaultState: AuthState = {
  user: null,
  tenantId: null,
  role: null,
  isAuthenticated: false,
  isLoading: true,
  login: () => {},
  logout: () => {},
}

// ─── Context ────────────────────────────────────────────────────────────────

export const AuthContext = createContext<AuthState>(defaultState)

// ─── Provider ───────────────────────────────────────────────────────────────

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Check session on mount
  useEffect(() => {
    let cancelled = false

    async function validateSession() {
      const token = getSessionToken()

      if (!token) {
        setIsLoading(false)
        return
      }

      try {
        const result = await fetchCurrentUser()

        if (cancelled) return

        if (result) {
          setUser(result.user)
          setTenantId(result.tenantId)
          setRole(result.role)
          setStoredRole(result.role)
        } else {
          // Invalid session - clear it
          clearSession()
          setUser(null)
          setTenantId(null)
          setRole(null)
        }
      } catch {
        if (cancelled) return
        clearSession()
        setUser(null)
        setTenantId(null)
        setRole(null)
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    validateSession()

    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(() => {
    window.location.href = getLoginUrl()
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setUser(null)
    setTenantId(null)
    setRole(null)
    window.location.href = "/login"
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user,
      tenantId,
      role,
      isAuthenticated: !!user,
      isLoading,
      login,
      logout,
    }),
    [user, tenantId, role, isLoading, login, logout]
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

// ─── Exchange helper (used by callback route) ───────────────────────────────

/**
 * Complete the auth flow by exchanging the one-time code for a session.
 * Returns user info on success, null on failure.
 */
export async function completeAuthExchange(
  exchangeId: string
): Promise<{ user: AuthUser; organizationId: string | null } | null> {
  try {
    const result = await exchangeAuthCode(exchangeId)
    setSessionToken(result.sessionToken)
    return { user: result.user, organizationId: result.organizationId }
  } catch {
    return null
  }
}
