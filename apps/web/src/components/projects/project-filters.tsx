import { useState } from "react"
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
import type { ProjectFilterState } from "@/routes/projects"

// ─── Options ────────────────────────────────────────────────────────────────

const RISK_OPTIONS = [
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
  { value: "INFO", label: "Info" },
]

// ─── Multi-Select Popover ───────────────────────────────────────────────────

interface MultiSelectProps {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onSelectionChange: (values: string[]) => void
}

function MultiSelect({
  label,
  options,
  selected,
  onSelectionChange,
}: MultiSelectProps) {
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
      <PopoverTrigger>
        <Button variant="outline" size="sm" className="h-8 text-xs">
          {label}
          {selected.length > 0 && (
            <Badge
              variant="secondary"
              className="ml-1.5 px-1 py-0 text-[10px] tabular-nums"
            >
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
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
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
      <MultiSelect
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
