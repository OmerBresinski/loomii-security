import { useState } from "react"
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

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MultiSelectOption {
  value: string
  label: string
}

interface MultiSelectFilterProps {
  label: string
  options: MultiSelectOption[]
  selected: string[]
  onSelectionChange: (values: string[]) => void
  onOptionHover?: (value: string) => void
}

// ─── Component ──────────────────────────────────────────────────────────────

export function MultiSelectFilter({
  label,
  options,
  selected,
  onSelectionChange,
  onOptionHover,
}: MultiSelectFilterProps) {
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
      <PopoverTrigger className="group/button inline-flex shrink-0 items-center justify-center rounded-4xl border border-border bg-background text-sm font-medium whitespace-nowrap transition-all outline-none select-none hover:bg-muted hover:text-foreground h-8 gap-1 px-3 text-xs">
        {label}
        {selected.length > 0 && (
          <Badge variant="secondary" className="ml-1.5 px-1 py-0 text-[10px] tabular-nums">
            {selected.length}
          </Badge>
        )}
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
                    onMouseEnter={onOptionHover ? () => onOptionHover(option.value) : undefined}
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
