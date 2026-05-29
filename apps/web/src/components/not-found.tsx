import { Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * Default 404 component shown when no route matches the current URL.
 */
export function DefaultNotFoundComponent() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-lg bg-muted">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-foreground"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Page not found</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
      </div>
      <Button asChild variant="outline" size="sm" className="mt-2">
        <Link to="/projects">Go to projects</Link>
      </Button>
    </div>
  )
}
