import { useState, useCallback } from "react"

/**
 * Hook that manages a Set<string> state with a toggle helper.
 * Returns [set, toggle, setAll] where:
 * - set: the current Set
 * - toggle: flips membership of a single id
 * - setAll: replaces the entire set (useful for "select all")
 */
export function useToggleSet(
  initial: Iterable<string> = []
): [Set<string>, (id: string) => void, (ids: Iterable<string>) => void] {
  const [set, setSet] = useState<Set<string>>(() => new Set(initial))

  const toggle = useCallback((id: string) => {
    setSet((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const setAll = useCallback((ids: Iterable<string>) => {
    setSet(new Set(ids))
  }, [])

  return [set, toggle, setAll]
}
