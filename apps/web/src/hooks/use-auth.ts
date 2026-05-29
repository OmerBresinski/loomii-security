import { useShallow } from "zustand/shallow"
import { useAuthStore } from "@/lib/auth-store"

/**
 * Hook to access auth state from any component.
 * Uses shallow equality to prevent re-renders when unrelated store fields change.
 *
 * @example
 * ```tsx
 * const { user, isAuthenticated, logout } = useAuth()
 * ```
 *
 * For granular subscriptions, use `useAuthStore` directly with a selector:
 * ```tsx
 * const role = useAuthStore(s => s.role)
 * ```
 */
export function useAuth() {
  return useAuthStore(
    useShallow((s) => ({
      user: s.user,
      tenantId: s.tenantId,
      role: s.role,
      isLoading: s.isLoading,
      isAuthenticated: s.isAuthenticated,
      login: s.login,
      logout: s.logout,
    }))
  )
}
