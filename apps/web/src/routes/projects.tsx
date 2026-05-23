import { useCallback, useMemo, useState } from "react"
import { Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useProjects } from "@/queries/projects"
import { ProjectRow } from "@/components/projects/project-row"
import { ProjectSearch } from "@/components/projects/project-search"
import { ProjectFilters } from "@/components/projects/project-filters"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProjectFilterState {
  search: string
  riskLevel: string[]
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { data, isPending } = useProjects()
  const projects = useMemo(() => data?.projects ?? [], [data?.projects])

  const [filters, setFilters] = useState<ProjectFilterState>({
    search: "",
    riskLevel: [],
  })

  const setSearch = useCallback((value: string) => {
    setFilters((prev) => ({ ...prev, search: value }))
  }, [])

  // Client-side filtering (project list is small)
  const filteredProjects = useMemo(() => {
    let result = projects

    if (filters.search) {
      const q = filters.search.toLowerCase()
      result = result.filter((p) => p.name.toLowerCase().includes(q))
    }

    if (filters.riskLevel.length > 0) {
      result = result.filter(
        (p) => p.highestRisk && filters.riskLevel.includes(p.highestRisk)
      )
    }

    return result
  }, [projects, filters.search, filters.riskLevel])

  const hasActiveFilters =
    filters.search.length > 0 || filters.riskLevel.length > 0

  return (
    <div className="flex h-full flex-col overflow-hidden p-6">
      {/* Toolbar */}
      <div className="flex items-center gap-3 pb-4">
        <Button
          size="sm"
          className="size-8 bg-[#2C7FFF] p-0 text-white hover:bg-[#2C7FFF]/90"
        >
          <Link to="/projects/new" aria-label="New project">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </Link>
        </Button>
        <ProjectSearch value={filters.search} onChange={setSearch} />
        <ProjectFilters filters={filters} onFiltersChange={setFilters} />
      </div>

      {/* Table */}
      {isPending ? (
        <div className="flex flex-col rounded-md">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex h-12 items-center px-4">
              <Skeleton className="h-4 w-full max-w-md" />
            </div>
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-md p-6 text-center">
          <p className="text-sm font-medium">
            {hasActiveFilters ? "No projects match" : "No projects yet"}
          </p>
          <p className="text-xs text-muted-foreground">
            {hasActiveFilters
              ? "Try adjusting your search or filters."
              : "Projects group related sources to give your security reviews better context."}
          </p>
          {!hasActiveFilters && (
            <Button size="sm" className="mt-3">
              <Link to="/projects/new">Create your first project</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col rounded-md">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filteredProjects.map((project) => (
              <ProjectRow key={project.id} project={project} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
