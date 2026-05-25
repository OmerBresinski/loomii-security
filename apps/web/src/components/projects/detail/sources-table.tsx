import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  MoreHorizontalIcon,
  ArrowUpRight01Icon,
  Archive01Icon,
  ArchiveRestoreIcon,
  Delete02Icon,
  ArrowMoveRightDownIcon,
} from "@hugeicons/core-free-icons"
import {
  DropdownMenu,
  DropdownMenuContent,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import type { ProjectSource } from "@/queries/projects"
import { MoveSourceDialog } from "./move-source-dialog"

// ─── Source Icons & Labels ──────────────────────────────────────────────────

const sourceFavicons: Record<string, string> = {
  LINEAR_ISSUE: "https://www.google.com/s2/favicons?domain=linear.app&sz=64",
  NOTION_PAGE: "https://www.google.com/s2/favicons?domain=notion.so&sz=64",
}

const sourceTypeLabels: Record<string, string> = {
  LINEAR_ISSUE: "Linear",
  NOTION_PAGE: "Notion",
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatLinkedDate(isoDate: string): string {
  const date = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function getUserDisplayName(user: {
  firstName: string | null
  lastName: string | null
  email: string
}): string {
  if (user.firstName && user.lastName)
    return `${user.firstName} ${user.lastName}`
  if (user.firstName) return user.firstName
  return user.email
}

function getUserInitials(user: {
  firstName: string | null
  lastName: string | null
  email: string
}): string {
  if (user.firstName && user.lastName) {
    return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
  }
  if (user.firstName) return user.firstName[0]!.toUpperCase()
  return user.email[0]!.toUpperCase()
}

function formatLinkReason(
  reason: Record<string, unknown> | null
): string | null {
  if (!reason) return null
  if (typeof reason.message === "string") return reason.message
  if (typeof reason.reason === "string") return reason.reason
  // Extract useful info from common link reason shapes
  if (reason.method === "embedding_nearest_project" && typeof reason.similarity === "number") {
    return `Matched (${Math.round((reason.similarity as number) * 100)}% similar)`
  }
  if (reason.method === "linear_project_mirror") return "Linear project sync"
  if (reason.method === "notion_parent_match") return "Notion parent page"
  if (reason.method === "manual") return "Manually linked"
  // Fallback: don't show raw JSON
  if (typeof reason.method === "string") return reason.method.replace(/_/g, " ")
  return null
}

// ─── Loading Skeleton ───────────────────────────────────────────────────────

export function SourcesTableSkeleton() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex h-12 items-center gap-3 border-b border-border/30 pr-3 pl-[18px]"
        >
          <Skeleton className="size-5 rounded" />
          <Skeleton className="h-3.5 w-[50px]" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className="h-5 w-12 rounded-full" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-12 rounded-full" />
          <Skeleton className="size-6 rounded" />
        </div>
      ))}
    </div>
  )
}

// ─── Source Row ─────────────────────────────────────────────────────────────

interface SourceRowProps {
  source: ProjectSource
  onArchive: (sourceId: string, isArchived: boolean) => void
  onUnlink: (sourceId: string) => void
  onMove: (sourceId: string) => void
  isArchiving?: boolean
}

function SourceRow({
  source,
  onArchive,
  onUnlink,
  onMove,
  isArchiving,
}: SourceRowProps) {
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false)
  const linkReasonText = formatLinkReason(source.linkReason)

  return (
    <>
      <div className="group flex h-12 items-center gap-3 border-b border-border/30 pr-3 pl-[20px] last:border-b-0 hover:bg-accent/50 dark:hover:bg-[#25262A]/50">
        {/* Type icon */}
        <img
          src={sourceFavicons[source.sourceType]}
          alt={sourceTypeLabels[source.sourceType]}
          width={18}
          height={18}
          loading="lazy"
          decoding="async"
          className="shrink-0"
        />

        {/* Source name + external link */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate text-[13px]">
            {source.title ?? source.sourceId}
          </span>
          {source.sourceUrl ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={source.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                >
                  <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} />
                </a>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Open in {sourceTypeLabels[source.sourceType]}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>

        {/* Link reason (inline, only if present) */}
        {linkReasonText ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="max-w-[200px] shrink-0 truncate text-[11px] text-muted-foreground/70">
                {linkReasonText}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[300px] text-xs">
              {linkReasonText}
            </TooltipContent>
          </Tooltip>
        ) : null}

        {/* Linked by user avatar */}
        {source.linkedByUser ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="shrink-0">
                <Avatar size="sm" className="size-5">
                  <AvatarFallback className="text-[9px]">
                    {getUserInitials(source.linkedByUser)}
                  </AvatarFallback>
                </Avatar>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Linked by {getUserDisplayName(source.linkedByUser)}
            </TooltipContent>
          </Tooltip>
        ) : null}

        {/* Link method badge */}
        <Badge
          variant={source.linkedBy === "AUTO" ? "secondary" : "outline"}
          className="h-5 shrink-0 text-[10px]"
        >
          {source.linkedBy === "AUTO" ? "Auto" : "Manual"}
        </Badge>

        {/* Linked date */}
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {formatLinkedDate(source.linkedAt)}
        </span>

        {/* Actions dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-20 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground">
              <HugeiconsIcon icon={MoreHorizontalIcon} size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onClick={() => onArchive(source.id, !source.isArchived)}
              disabled={isArchiving}
            >
              <HugeiconsIcon
                icon={source.isArchived ? ArchiveRestoreIcon : Archive01Icon}
                size={14}
              />
              {source.isArchived ? "Unarchive" : "Archive"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMove(source.id)}>
              <HugeiconsIcon icon={ArrowMoveRightDownIcon} size={14} />
              Move to project
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setShowUnlinkConfirm(true)}
            >
              <HugeiconsIcon icon={Delete02Icon} size={14} />
              Unlink
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Unlink confirmation */}
      <AlertDialog open={showUnlinkConfirm} onOpenChange={setShowUnlinkConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink source</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove &ldquo;{source.title ?? source.sourceId}&rdquo; from
              this project. The source itself won&apos;t be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onUnlink(source.id)
                setShowUnlinkConfirm(false)
              }}
            >
              Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ─── Sources Table ──────────────────────────────────────────────────────────

interface SourcesTableProps {
  sources: ProjectSource[]
  showArchived: boolean
  onArchive: (sourceId: string, isArchived: boolean) => void
  onUnlink: (sourceId: string) => void
  onMove: (sourceId: string) => void
  archivingSourceId?: string | null
  projectId: string
}

export function SourcesTable({
  sources,
  showArchived,
  onArchive,
  onUnlink,
  onMove,
  archivingSourceId,
  projectId,
}: SourcesTableProps) {
  const [moveSourceId, setMoveSourceId] = useState<string | null>(null)

  const filtered = showArchived ? sources : sources.filter((s) => !s.isArchived)

  if (filtered.length === 0) {
    return (
      <p className="py-8 text-center text-[12px] text-muted-foreground">
        {showArchived
          ? "No sources linked to this project."
          : "No active sources. Toggle archived to see all."}
      </p>
    )
  }

  return (
    <>
      <div className="flex flex-col">
        {filtered.map((source) => (
          <SourceRow
            key={source.id}
            source={source}
            onArchive={onArchive}
            onUnlink={onUnlink}
            onMove={() => setMoveSourceId(source.id)}
            isArchiving={archivingSourceId === source.id}
          />
        ))}
      </div>

      {/* Move dialog */}
      <MoveSourceDialog
        open={!!moveSourceId}
        onClose={() => setMoveSourceId(null)}
        sourceId={moveSourceId}
        projectId={projectId}
        onMove={onMove}
      />
    </>
  )
}
