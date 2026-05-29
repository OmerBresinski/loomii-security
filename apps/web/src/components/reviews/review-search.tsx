import { DebouncedSearchInput } from "@/components/ui/debounced-search-input"

interface ReviewSearchProps {
  value: string
  onChange: (value: string) => void
}

export function ReviewSearch({ value, onChange }: ReviewSearchProps) {
  return (
    <DebouncedSearchInput
      value={value}
      onChange={onChange}
      placeholder="Search reviews..."
    />
  )
}
