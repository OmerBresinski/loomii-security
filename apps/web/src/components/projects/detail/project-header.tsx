import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useUpdateProject, useDeleteProject } from "@/mutations/projects"
import type { ProjectDetail } from "@loomii/shared"

// ─── Icons ──────────────────────────────────────────────────────────────────

const MoreIcon = (
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
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
    <circle cx="5" cy="12" r="1" />
  </svg>
)

// ─── Component ──────────────────────────────────────────────────────────────

interface ProjectHeaderProps {
  project?: ProjectDetail
  isPending: boolean
}

export function ProjectHeader({ project, isPending }: ProjectHeaderProps) {
  const navigate = useNavigate()
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState("")
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const updateMutation = useUpdateProject(project?.id ?? "")
  const deleteMutation = useDeleteProject()

  // Stable references to mutation functions (these don't change between renders)
  const updateRef = useRef(updateMutation.mutate)
  updateRef.current = updateMutation.mutate
  const deleteRef = useRef(deleteMutation.mutate)
  deleteRef.current = deleteMutation.mutate

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const startEditing = useCallback(() => {
    if (!project) return
    setEditValue(project.name)
    setIsEditing(true)
  }, [project])

  const cancelEditing = useCallback(() => {
    setIsEditing(false)
    setEditValue("")
  }, [])

  const submitEdit = useCallback(() => {
    if (!project) return
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== project.name) {
      updateRef.current({ name: trimmed })
    }
    setIsEditing(false)
  }, [project, editValue])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault()
        submitEdit()
      } else if (e.key === "Escape") {
        cancelEditing()
      }
    },
    [submitEdit, cancelEditing]
  )

  const handleDelete = useCallback(() => {
    if (!project) return
    deleteRef.current(project.id, {
      onSuccess: () => {
        navigate({ to: "/projects" })
      },
    })
  }, [project, navigate])

  if (isPending) {
    return (
      <div className="flex items-center gap-3">
        <Skeleton className="h-7 w-48" />
      </div>
    )
  }

  if (!project) return null

  return (
    <>
      <div className="flex items-center gap-3">
        {/* Project Name (inline editable) */}
        {isEditing ? (
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={submitEdit}
            onKeyDown={handleKeyDown}
            className="h-8 w-64 text-sm font-semibold"
          />
        ) : (
          <h1
            className="cursor-pointer text-sm font-semibold hover:underline hover:decoration-muted-foreground/40 hover:underline-offset-4"
            onClick={startEditing}
            title="Click to rename"
          >
            {project.name}
          </h1>
        )}

        {/* Settings Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="size-7 p-0 text-muted-foreground"
            >
              {MoreIcon}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={startEditing}>
                Rename
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setShowDeleteDialog(true)}
              >
                Delete project
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{project.name}&rdquo;? This
              action cannot be undone. All linked sources and reviews will be
              unlinked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
