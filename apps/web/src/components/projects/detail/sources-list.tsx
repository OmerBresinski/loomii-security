import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons"
import { Skeleton } from "@/components/ui/skeleton"
import type { ProjectSourcesResponse } from "@/queries/projects"

// ─── Source Icons ───────────────────────────────────────────────────────────

const sourceFavicons: Record<string, string> = {
  LINEAR_ISSUE: "https://www.google.com/s2/favicons?domain=linear.app&sz=64",
  NOTION_PAGE: "https://www.google.com/s2/favicons?domain=notion.so&sz=64",
}

const sourceTypeLabels: Record<string, string> = {
  LINEAR_ISSUE: "Linear",
  NOTION_PAGE: "Notion",
}

// ─── Component ──────────────────────────────────────────────────────────────

interface SourcesListProps {
  sources?: ProjectSourcesResponse
  isPending: boolean
}

export function SourcesList({ sources, isPending }: SourcesListProps) {
  if (isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="size-4 rounded" />
            <Skeleton className="h-3.5 w-full" />
          </div>
        ))}
      </div>
    )
  }

  const activeSources = sources?.sources.filter((s) => !s.isArchived) ?? []

  return (
    <div className="flex flex-col gap-3">
      {activeSources.length === 0 ? (
        <p className="text-xs text-muted-foreground">No sources linked yet.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {activeSources.map((source) =>
            source.sourceUrl ? (
              <a
                key={source.id}
                href={source.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${source.sourceId} in ${sourceTypeLabels[source.sourceType]}`}
                className="group flex items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors duration-[80ms] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
              >
                <img
                  src={sourceFavicons[source.sourceType]}
                  alt={sourceTypeLabels[source.sourceType]}
                  width={16}
                  height={16}
                  loading="lazy"
                  decoding="async"
                  className="shrink-0"
                />
                <span className="min-w-0 flex-1 truncate text-xs text-foreground/80 group-hover:text-foreground">
                  {source.title ?? source.sourceId}
                </span>
                <HugeiconsIcon
                  icon={ArrowUpRight01Icon}
                  size={14}
                  className="ml-auto shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                />
              </a>
            ) : (
              <div
                key={source.id}
                className="flex items-center gap-2 rounded-md px-1.5 py-1.5"
              >
                <img
                  src={sourceFavicons[source.sourceType]}
                  alt={sourceTypeLabels[source.sourceType]}
                  width={16}
                  height={16}
                  loading="lazy"
                  decoding="async"
                  className="shrink-0"
                />
                <span className="truncate text-xs text-foreground/80">
                  {source.title ?? source.sourceId}
                </span>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
