import { DebouncedSearchInput } from "@/components/ui/debounced-search-input"

interface ProjectSearchProps {
  value: string
  onChange: (value: string) => void
}

export function ProjectSearch({ value, onChange }: ProjectSearchProps) {
  return (
    <DebouncedSearchInput
      value={value}
      onChange={onChange}
      placeholder="Search projects..."
    />
  )
}
