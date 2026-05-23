import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useProjects } from "@/queries/projects"
import { useRelinkSource } from "@/mutations/projects"

// ─── Move Source Dialog ─────────────────────────────────────────────────────

interface MoveSourceDialogProps {
  open: boolean
  onClose: () => void
  sourceId: string | null
  projectId: string
  onMove: (sourceId: string) => void
}

export function MoveSourceDialog({
  open,
  onClose,
  sourceId,
  projectId,
  onMove,
}: MoveSourceDialogProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const { data: projectsData, isPending } = useProjects()
  const relinkMutation = useRelinkSource(projectId)

  const projects = projectsData?.projects.filter((p) => p.id !== projectId) ?? []

  function handleMove() {
    if (!sourceId || !selectedProjectId) return
    relinkMutation.mutate(
      { sourceId, targetProjectId: selectedProjectId },
      {
        onSuccess: () => {
          onMove(sourceId)
          setSelectedProjectId(null)
          onClose()
        },
      }
    )
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setSelectedProjectId(null)
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Move to project</DialogTitle>
        </DialogHeader>

        <div className="max-h-[240px] min-h-[80px] overflow-y-auto rounded-md border border-border/50">
          {isPending ? (
            <div className="flex flex-col gap-1 p-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-2">
                  <Skeleton className="size-4 rounded" />
                  <Skeleton className="h-3 flex-1" />
                </div>
              ))}
            </div>
          ) : projects.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-muted-foreground">
              No other projects available.
            </p>
          ) : (
            <div className="flex flex-col gap-0.5 p-1.5">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => setSelectedProjectId(project.id)}
                  className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors ${
                    selectedProjectId === project.id
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  }`}
                >
                  {project.icon ? (
                    <span className="shrink-0 text-sm">{project.icon}</span>
                  ) : (
                    <span className="flex size-4 shrink-0 items-center justify-center rounded bg-muted text-[10px]">
                      {project.name.charAt(0)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {project.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleMove}
            disabled={!selectedProjectId || relinkMutation.isPending}
          >
            {relinkMutation.isPending ? "Moving..." : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
