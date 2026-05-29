import { useQueryErrorResetBoundary } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api-client"

// ─── Types ──────────────────────────────────────────────────────────────────

interface ErrorComponentProps {
  error?: Error
  reset?: () => void
}

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * Default error component for route-level errors.
 *
 * Handles:
 * - Aborted loaders (error is undefined) — renders nothing
 * - Network errors — shows retry button
 * - Unexpected errors — shows error message + retry
 */
export function DefaultErrorComponent({ error, reset }: ErrorComponentProps) {
  const { reset: resetQueries } = useQueryErrorResetBoundary()

  // Aborted loader during rapid navigation — render nothing
  if (!error) return null

  function handleRetry() {
    resetQueries()
    reset?.()
  }

  // Network errors are non-ApiError exceptions (TypeError from fetch, etc.)
  // ApiError means the server responded — it's an application error, not a connection issue.
  const isNetworkError = !(error instanceof ApiError)

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-lg bg-destructive/10">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-destructive"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">
          {isNetworkError ? "Connection error" : "Something went wrong"}
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {isNetworkError
            ? "Unable to reach the server. Check your connection and try again."
            : error.message || "An unexpected error occurred. Please try again."}
        </p>
      </div>
      <Button variant="outline" size="sm" className="mt-2" onClick={handleRetry}>
        Try again
      </Button>
    </div>
  )
}
