import { Button } from "@/components/ui/button"
import { MultiSelectFilter } from "@/components/ui/multi-select-filter"
import type { ProjectFilterState } from "@/routes/projects"

// ─── Options ────────────────────────────────────────────────────────────────

const RISK_OPTIONS = [
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
  { value: "INFO", label: "Info" },
]

// ─── Filters Component ──────────────────────────────────────────────────────

interface ProjectFiltersProps {
  filters: ProjectFilterState
  onFiltersChange: (filters: ProjectFilterState) => void
}

export function ProjectFilters({
  filters,
  onFiltersChange,
}: ProjectFiltersProps) {
  const hasActiveFilters = filters.riskLevel.length > 0

  return (
    <div className="flex items-center gap-2">
      <MultiSelectFilter
        label="Risk"
        options={RISK_OPTIONS}
        selected={filters.riskLevel}
        onSelectionChange={(values) =>
          onFiltersChange({ ...filters, riskLevel: values })
        }
      />
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-muted-foreground"
          onClick={() => onFiltersChange({ ...filters, riskLevel: [] })}
        >
          Clear
        </Button>
      )}
    </div>
  )
}
