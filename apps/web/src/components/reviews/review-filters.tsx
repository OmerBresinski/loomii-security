import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { MultiSelectFilter } from "@/components/ui/multi-select-filter"
import { type ReviewFilters, reviewsInfiniteQueryOptions } from "@/queries/reviews"

// ─── Options ────────────────────────────────────────────────────────────────

const RISK_OPTIONS = [
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
  { value: "INFO", label: "Info" },
]

const STATUS_OPTIONS = [
  { value: "ASSEMBLING", label: "Assembling" },
  { value: "READY", label: "Ready" },
  { value: "REVIEWING", label: "Reviewing" },
  { value: "COMPLETED", label: "Completed" },
  { value: "FAILED", label: "Failed" },
]

// ─── Filters Component ──────────────────────────────────────────────────────

interface ReviewFiltersProps {
  filters: ReviewFilters
  onFiltersChange: (filters: ReviewFilters) => void
}

export function ReviewFiltersBar({ filters, onFiltersChange }: ReviewFiltersProps) {
  const queryClient = useQueryClient()

  const hasActiveFilters =
    (filters.riskLevel && filters.riskLevel.length > 0) ||
    (filters.status && filters.status.length > 0)

  // Prefetch the query for a filter option on hover
  function prefetchRisk(value: string) {
    const nextRisk = filters.riskLevel?.includes(value)
      ? filters.riskLevel.filter((v) => v !== value)
      : [...(filters.riskLevel ?? []), value]
    queryClient.prefetchInfiniteQuery(
      reviewsInfiniteQueryOptions({ ...filters, riskLevel: nextRisk })
    )
  }

  function prefetchStatus(value: string) {
    const nextStatus = filters.status?.includes(value)
      ? filters.status.filter((v) => v !== value)
      : [...(filters.status ?? []), value]
    queryClient.prefetchInfiniteQuery(
      reviewsInfiniteQueryOptions({ ...filters, status: nextStatus })
    )
  }

  return (
    <div className="flex items-center gap-2">
      <MultiSelectFilter
        label="Risk"
        options={RISK_OPTIONS}
        selected={filters.riskLevel ?? []}
        onSelectionChange={(values) =>
          onFiltersChange({ ...filters, riskLevel: values })
        }
        onOptionHover={prefetchRisk}
      />
      <MultiSelectFilter
        label="Status"
        options={STATUS_OPTIONS}
        selected={filters.status ?? []}
        onSelectionChange={(values) =>
          onFiltersChange({ ...filters, status: values })
        }
        onOptionHover={prefetchStatus}
      />
      <Button
        variant="ghost"
        size="sm"
        className={`h-8 text-xs text-muted-foreground transition-none ${hasActiveFilters ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={() => onFiltersChange({ ...filters, riskLevel: [], status: [] })}
      >
        Clear
      </Button>
    </div>
  )
}
