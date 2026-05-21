import { useContext } from "react"
import { AuthContext, type AuthState } from "@/lib/auth"

/**
 * Hook to access auth state from any component.
 * Must be used within an AuthProvider.
 *
 * @example
 * ```tsx
 * const { user, isAuthenticated, logout } = useAuth()
 * ```
 */
export function useAuth(): AuthState {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }

  return context
}
