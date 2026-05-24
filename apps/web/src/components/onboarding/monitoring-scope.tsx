// ─── Step 4: Monitoring Scope ────────────────────────────────────────────────

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useMonitoringScope } from "@/queries/onboarding"
import { useSaveMonitoringScope } from "@/mutations/onboarding"

interface MonitoringScopeProps {
  onNext: () => void
  onSkip: () => void
  onBack: () => void
}

export function MonitoringScope({ onNext, onSkip, onBack }: MonitoringScopeProps) {
  const { data, isPending } = useMonitoringScope()
  const saveScope = useSaveMonitoringScope()

  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set())
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(
    new Set()
  )
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set())

  const hasLinear =
    data && (data.linearTeams.length > 0 || data.linearProjects.length > 0)
  const hasNotion = data && data.notionPages.length > 0
  const hasAnyResources = hasLinear || hasNotion

  // Auto-skip if no workspaces connected (nothing to scope)
  useEffect(() => {
    if (!isPending && !hasAnyResources) {
      onSkip()
    }
  }, [isPending, hasAnyResources]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleTeam(id: string) {
    setSelectedTeams((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleProject(id: string) {
    setSelectedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function togglePage(id: string) {
    setSelectedPages((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    if (data) {
      setSelectedTeams(new Set(data.linearTeams.map((t) => t.id)))
      setSelectedProjects(new Set(data.linearProjects.map((p) => p.id)))
      setSelectedPages(new Set(data.notionPages.map((p) => p.id)))
    }
  }

  function handleContinue() {
    saveScope.mutate(
      {
        linearTeamIds: Array.from(selectedTeams),
        linearProjectIds: Array.from(selectedProjects),
        notionPageIds: Array.from(selectedPages),
      },
      { onSuccess: () => onNext() }
    )
  }

  const totalSelected =
    selectedTeams.size + selectedProjects.size + selectedPages.size

  if (isPending) {
    return (
      <Card className="mx-auto w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-base">Select Monitoring Scope</CardTitle>
          <CardDescription className="text-xs">
            Loading available resources...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex h-10 items-center gap-3 px-3">
                <Skeleton className="size-4 rounded" />
                <Skeleton className="h-3.5 flex-1" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader className="text-center">
        <CardTitle className="text-base">Select Monitoring Scope</CardTitle>
        <CardDescription className="text-xs">
          Choose which projects, teams, and pages Loomii should monitor for
          security risks.
        </CardDescription>
        <div className="flex items-center justify-center gap-2 pt-2">
          <Badge variant="secondary" className="text-[10px]">
            {totalSelected} selected
          </Badge>
          <button
            onClick={selectAll}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            Select all
          </button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="max-h-[340px] overflow-y-auto rounded-md border border-border/50">
          {/* Linear Teams */}
          {hasLinear && data.linearTeams.length > 0 && (
            <>
              <div className="sticky top-0 z-10 border-b border-border/30 bg-card px-4 py-2">
                <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Linear Teams
                </span>
              </div>
              {data.linearTeams.map((team) => (
                <label
                  key={team.id}
                  className="flex cursor-pointer items-center gap-3 border-b border-border/30 px-4 py-2.5 hover:bg-accent last:border-b-0"
                >
                  <Checkbox
                    checked={selectedTeams.has(team.id)}
                    onCheckedChange={() => toggleTeam(team.id)}
                  />
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="text-[13px]">{team.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {team.key}
                    </span>
                  </div>
                </label>
              ))}
            </>
          )}

          {/* Linear Projects */}
          {hasLinear && data.linearProjects.length > 0 && (
            <>
              <div className="sticky top-0 z-10 border-b border-border/30 bg-card px-4 py-2">
                <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Linear Projects
                </span>
              </div>
              {data.linearProjects.map((project) => (
                <label
                  key={project.id}
                  className="flex cursor-pointer items-center gap-3 border-b border-border/30 px-4 py-2.5 hover:bg-accent last:border-b-0"
                >
                  <Checkbox
                    checked={selectedProjects.has(project.id)}
                    onCheckedChange={() => toggleProject(project.id)}
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[13px]">{project.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {project.teamName}
                    </span>
                  </div>
                </label>
              ))}
            </>
          )}

          {/* Notion Pages */}
          {hasNotion && (
            <>
              <div className="sticky top-0 z-10 border-b border-border/30 bg-card px-4 py-2">
                <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Notion Pages
                </span>
              </div>
              {data.notionPages.map((page) => (
                <label
                  key={page.id}
                  className="flex cursor-pointer items-center gap-3 border-b border-border/30 px-4 py-2.5 hover:bg-accent last:border-b-0"
                >
                  <Checkbox
                    checked={selectedPages.has(page.id)}
                    onCheckedChange={() => togglePage(page.id)}
                  />
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {page.icon && (
                      <span className="text-sm">{page.icon}</span>
                    )}
                    <span className="truncate text-[13px]">{page.title}</span>
                    {page.parentTitle && (
                      <span className="text-[11px] text-muted-foreground">
                        in {page.parentTitle}
                      </span>
                    )}
                  </div>
                </label>
              ))}
            </>
          )}

          {/* Empty state when no workspaces connected */}
          {!hasLinear && !hasNotion && (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <p className="text-xs text-muted-foreground">
                No connected workspaces found. Connect Linear or Notion first.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={onBack}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Back
          </button>
          <Button
            size="sm"
            onClick={handleContinue}
            disabled={saveScope.isPending || totalSelected === 0}
          >
            {saveScope.isPending ? "Saving..." : "Continue"}
          </Button>
          <button
            onClick={onSkip}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Skip (monitor everything)
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
