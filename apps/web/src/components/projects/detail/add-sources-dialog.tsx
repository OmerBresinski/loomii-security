import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Search01Icon } from "@hugeicons/core-free-icons"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  useSourceSearch,
  type SourceSearchResult,
} from "@/queries/projects"
import { useLinkSources } from "@/mutations/projects"
import { sourceTypeFavicons as sourceFavicons, sourceTypeLabels } from "@/lib/source-constants"

// ─── Add Sources Dialog ─────────────────────────────────────────────────────

interface AddSourcesDialogProps {
  open: boolean
  onClose: () => void
  projectId: string
}

export function AddSourcesDialog({
  open,
  onClose,
  projectId,
}: AddSourcesDialogProps) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<SourceSearchResult[]>([])

  const { data: searchData, isPending: isSearching } = useSourceSearch(query)
  const linkMutation = useLinkSources(projectId)

  function handleToggleResult(result: SourceSearchResult) {
    setSelected((prev) => {
      const exists = prev.some((s) => s.sourceId === result.sourceId)
      if (exists) return prev.filter((s) => s.sourceId !== result.sourceId)
      return [...prev, result]
    })
  }

  function handleLink() {
    if (selected.length === 0) return
    linkMutation.mutate(
      {
        sources: selected.map((s) => ({
          sourceType: s.sourceType,
          sourceId: s.sourceId,
        })),
      },
      {
        onSuccess: () => {
          setQuery("")
          setSelected([])
          onClose()
        },
      }
    )
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setQuery("")
      setSelected([])
      onClose()
    }
  }

  const results = searchData?.results ?? []

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add sources</DialogTitle>
        </DialogHeader>

        {/* Search input */}
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            size={16}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Linear issues, Notion pages..."
            className="pl-9"
            autoFocus
          />
        </div>

        {/* Results */}
        <div className="max-h-[280px] min-h-[120px] overflow-y-auto rounded-md border border-border/50">
          {query.length < 2 ? (
            <p className="py-8 text-center text-[12px] text-muted-foreground">
              Type at least 2 characters to search.
            </p>
          ) : isSearching ? (
            <div className="flex flex-col gap-1 p-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-2">
                  <Skeleton className="size-4 rounded" />
                  <Skeleton className="h-3 flex-1" />
                </div>
              ))}
            </div>
          ) : results.length === 0 ? (
            <p className="py-8 text-center text-[12px] text-muted-foreground">
              No results found.
            </p>
          ) : (
            <div className="flex flex-col gap-0.5 p-1.5">
              {results.map((result) => {
                const isSelected = selected.some(
                  (s) => s.sourceId === result.sourceId
                )
                return (
                  <button
                    key={result.sourceId}
                    onClick={() => handleToggleResult(result)}
                    className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors ${
                      isSelected
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/50"
                    }`}
                  >
                    <img
                      src={sourceFavicons[result.sourceType]}
                      alt={sourceTypeLabels[result.sourceType]}
                      width={16}
                      height={16}
                      loading="lazy"
                      decoding="async"
                      className="shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px]">
                      {result.title}
                    </span>
                    {isSelected ? (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        className="shrink-0 text-foreground"
                      >
                        <path
                          d="M3.5 8.5l3 3 6-6"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleLink}
            disabled={selected.length === 0 || linkMutation.isPending}
          >
            {linkMutation.isPending
              ? "Linking..."
              : `Link ${selected.length > 0 ? `(${selected.length})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
