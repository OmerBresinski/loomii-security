import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"

interface ReviewSearchProps {
  value: string
  onChange: (value: string) => void
}

export function ReviewSearch({ value, onChange }: ReviewSearchProps) {
  const [localValue, setLocalValue] = useState(value)

  // Sync external changes (e.g., URL nav)
  useEffect(() => {
    setLocalValue(value)
  }, [value])

  // Debounce: emit onChange 300ms after user stops typing
  useEffect(() => {
    if (localValue === value) return

    const timeout = setTimeout(() => {
      onChange(localValue)
    }, 300)

    return () => clearTimeout(timeout)
  }, [localValue, value, onChange])

  return (
    <Input
      type="search"
      placeholder="Search reviews..."
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      className="h-8 w-64 text-xs"
    />
  )
}
