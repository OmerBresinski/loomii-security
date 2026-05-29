import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"

// ─── Types ──────────────────────────────────────────────────────────────────

interface DebouncedSearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  debounceMs?: number
  className?: string
}

// ─── Component ──────────────────────────────────────────────────────────────

export function DebouncedSearchInput({
  value,
  onChange,
  placeholder = "Search...",
  debounceMs = 300,
  className = "h-8 w-64 text-xs",
}: DebouncedSearchInputProps) {
  const [localValue, setLocalValue] = useState(value)

  // Sync external changes (e.g., URL nav)
  useEffect(() => {
    setLocalValue((prev) => (prev !== value ? value : prev))
  }, [value])

  // Debounce: emit onChange after user stops typing
  useEffect(() => {
    if (localValue === value) return

    const timeout = setTimeout(() => {
      onChange(localValue)
    }, debounceMs)

    return () => clearTimeout(timeout)
  }, [localValue, value, onChange, debounceMs])

  return (
    <Input
      type="search"
      placeholder={placeholder}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      className={className}
    />
  )
}
