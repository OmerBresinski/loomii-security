import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { completeAuthExchange } from "@/lib/auth"

/**
 * Auth callback route: /auth/callback
 *
 * Receives the one-time exchange_id from the API callback redirect,
 * exchanges it for a session token, stores it, and redirects to /reviews.
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { exchange_id?: string }
  const [error, setError] = useState<string | null>(null)
  // Guard against React StrictMode double-invocation
  const exchangeAttempted = useRef(false)

  useEffect(() => {
    if (exchangeAttempted.current) return
    exchangeAttempted.current = true

    async function handleCallback() {
      const exchangeId = search?.exchange_id

      if (!exchangeId) {
        setError("Missing exchange token. Please try logging in again.")
        return
      }

      const result = await completeAuthExchange(exchangeId)

      if (!result) {
        setError("Authentication failed. Please try logging in again.")
        return
      }

      // Success - redirect to the app.
      // Use window.location to force a full reload so AuthProvider picks up the new session.
      window.location.href = "/reviews"
    }

    handleCallback()
  }, [search, navigate])

  if (error) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
          <a
            href="/login"
            className="inline-block text-sm text-primary underline underline-offset-4 hover:text-primary/80"
          >
            Back to login
          </a>
        </div>
      </div>
    )
  }

  // Loading state while exchanging token
  return (
    <div className="flex min-h-svh items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  )
}
