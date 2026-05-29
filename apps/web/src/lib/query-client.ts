import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query"
import { ApiError, clearSession } from "@/lib/api-client"

// ─── 401 Redirect Guard ─────────────────────────────────────────────────────

let isRedirecting = false

function handleUnauthorized() {
  if (isRedirecting) return
  isRedirecting = true

  clearSession()

  // Avoid redirect loops: only redirect if not already on login/auth pages
  if (
    !window.location.pathname.startsWith("/login") &&
    !window.location.pathname.startsWith("/auth")
  ) {
    window.location.href = "/login"
  }
}

// ─── Global Error Handlers ──────────────────────────────────────────────────

function handleQueryError(error: Error, query: { state: { data: unknown } }) {
  // 401: redirect to login
  if (error instanceof ApiError && error.status === 401) {
    handleUnauthorized()
    return
  }

  // Background refetch failures (query already had cached data): log for observability
  // TODO: Replace with toast notification when toast library is added
  if (query.state.data !== undefined) {
    console.error("[QueryCache] Background refetch failed:", error.message)
  }
}

function handleMutationError(error: Error) {
  // 401: redirect to login
  if (error instanceof ApiError && error.status === 401) {
    handleUnauthorized()
    return
  }

  // Server errors (5xx) fallback for mutations without their own error handling
  // TODO: Replace with toast notification when toast library is added
  if (error instanceof ApiError && error.status >= 500) {
    console.error("[MutationCache] Server error:", error.message)
  }
}

// ─── Query Client ───────────────────────────────────────────────────────────

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: handleQueryError,
  }),
  mutationCache: new MutationCache({
    onError: handleMutationError,
  }),
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        // Don't retry on 401 (will redirect)
        if (error instanceof ApiError && error.status === 401) return false
        return failureCount < 1
      },
    },
  },
})
