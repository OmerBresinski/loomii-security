import { create } from "zustand"
import {
  type AuthUser,
  type UserRole,
  clearSession,
  fetchCurrentUser,
  getLoginUrl,
  getSessionToken,
  setSessionToken,
  setStoredRole,
  setOnboardingCompleted,
  exchangeAuthCode,
} from "@/lib/api-client"

interface AuthState {
  user: AuthUser | null
  tenantId: string | null
  role: UserRole | null
  isLoading: boolean
  isAuthenticated: boolean
  // Actions
  hydrate: () => Promise<void>
  login: () => void
  logout: () => void
  setAuth: (user: AuthUser, tenantId: string, role: UserRole) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  tenantId: null,
  role: null,
  isLoading: true,
  isAuthenticated: false,

  hydrate: async () => {
    const token = getSessionToken()
    if (!token) {
      set({ isLoading: false })
      return
    }

    try {
      const result = await fetchCurrentUser()
      if (result) {
        setStoredRole(result.role)
        setOnboardingCompleted(result.onboardingCompleted)
        set({
          user: result.user,
          tenantId: result.tenantId,
          role: result.role,
          isAuthenticated: true,
          isLoading: false,
        })
      } else {
        clearSession()
        set({ user: null, tenantId: null, role: null, isAuthenticated: false, isLoading: false })
      }
    } catch {
      clearSession()
      set({ user: null, tenantId: null, role: null, isAuthenticated: false, isLoading: false })
    }
  },

  login: () => {
    window.location.href = getLoginUrl()
  },

  logout: () => {
    clearSession()
    set({ user: null, tenantId: null, role: null, isAuthenticated: false })
    window.location.href = "/login"
  },

  setAuth: (user, tenantId, role) => {
    set({ user, tenantId, role, isAuthenticated: true, isLoading: false })
  },
}))

// Exchange helper (used by callback route)
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
