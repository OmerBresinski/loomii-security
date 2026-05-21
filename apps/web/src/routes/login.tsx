import { useEffect } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAuth } from "@/hooks/use-auth"
import { getLoginUrl } from "@/lib/api-client"

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { error?: string }

  // If already authenticated, redirect to /reviews (no flash)
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate({ to: "/reviews" })
    }
  }, [isLoading, isAuthenticated, navigate])

  // Show nothing while checking auth to prevent flicker
  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  function handleLogin() {
    window.location.href = getLoginUrl()
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-xl">
            L
          </div>
          <CardTitle className="text-2xl">Sign in to Loomii</CardTitle>
          <CardDescription>
            Secure your development workflow with AI-powered security reviews.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {search?.error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {search.error === "missing_code"
                ? "Authentication failed. Please try again."
                : search.error === "auth_failed"
                  ? "Unable to authenticate. Please contact your admin."
                  : search.error === "no_organization"
                    ? "No organization linked to your account. Please contact your admin."
                    : "An error occurred. Please try again."}
            </div>
          )}
          <Button
            onClick={handleLogin}
            className="w-full"
            size="lg"
          >
            Continue with WorkOS
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Your organization&apos;s SSO, MFA, and login are handled securely by
            WorkOS AuthKit.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
