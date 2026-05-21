import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
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

// ─── Multi-Select Popover ───────────────────────────────────────────────────

interface MultiSelectProps {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onSelectionChange: (values: string[]) => void
  onOptionHover?: (value: string) => void
}

function MultiSelect({ label, options, selected, onSelectionChange, onOptionHover }: MultiSelectProps) {
  const [open, setOpen] = useState(false)

  function toggle(value: string) {
    if (selected.includes(value)) {
      onSelectionChange(selected.filter((v) => v !== value))
    } else {
      onSelectionChange([...selected, value])
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs">
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="ml-1.5 px-1 py-0 text-[10px] tabular-nums">
              {selected.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-0" align="start">
        <Command>
          <CommandList>
            <CommandEmpty>No options.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.includes(option.value)
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => toggle(option.value)}
                    onMouseEnter={() => onOptionHover?.(option.value)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex size-4 items-center justify-center rounded-sm border ${
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/30"
                        }`}
                      >
                        {isSelected && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <span className="text-xs">{option.label}</span>
                    </div>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

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
      <MultiSelect
        label="Risk"
        options={RISK_OPTIONS}
        selected={filters.riskLevel ?? []}
        onSelectionChange={(values) =>
          onFiltersChange({ ...filters, riskLevel: values })
        }
        onOptionHover={prefetchRisk}
      />
      <MultiSelect
        label="Status"
        options={STATUS_OPTIONS}
        selected={filters.status ?? []}
        onSelectionChange={(values) =>
          onFiltersChange({ ...filters, status: values })
        }
        onOptionHover={prefetchStatus}
      />
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-muted-foreground"
          onClick={() => onFiltersChange({ ...filters, riskLevel: [], status: [] })}
        >
          Clear
        </Button>
      )}
    </div>
  )
}
