import { Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"

// ─── Component ──────────────────────────────────────────────────────────────

export function ProjectsEmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-md p-12 text-center">
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
          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
          <line x1="12" y1="10" x2="12" y2="16" />
          <line x1="9" y1="13" x2="15" y2="13" />
        </svg>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">No projects yet</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Projects group related sources (Notion pages, Linear issues) to give
          your security reviews better context. Create one to get started.
        </p>
      </div>
      <Button asChild size="sm" className="mt-2">
        <Link to="/projects/new">Create your first project</Link>
      </Button>
    </div>
  )
}
