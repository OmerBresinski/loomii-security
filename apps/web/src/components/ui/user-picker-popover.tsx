import { useState, useMemo } from "react"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { UserAvatar, getDisplayName } from "@/components/ui/user-avatar"
import { useTeamMembers } from "@/queries/settings"
import { useAuth } from "@/hooks/use-auth"

// ─── Component ──────────────────────────────────────────────────────────────

interface UserPickerPopoverProps {
  selectedUserId: string | null
  onSelect: (userId: string | null) => void
  children: React.ReactNode
}

export function UserPickerPopover({ selectedUserId, onSelect, children }: UserPickerPopoverProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const { user: currentUser } = useAuth()
  const { data } = useTeamMembers()

  const members = data?.members ?? []

  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim()
    if (!query) return members

    return members.filter((m) => {
      const name = getDisplayName(m).toLowerCase()
      return name.includes(query) || m.email.toLowerCase().includes(query)
    })
  }, [members, search])

  // Sort: current user first, then alphabetical
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.id === currentUser?.id) return -1
      if (b.id === currentUser?.id) return 1
      return getDisplayName(a).localeCompare(getDisplayName(b))
    })
  }, [filtered, currentUser?.id])

  function handleSelect(userId: string | null) {
    onSelect(userId)
    setOpen(false)
    setSearch("")
  }

  return (
    <Popover open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setSearch("") }}>
      <PopoverTrigger>
        {children}
      </PopoverTrigger>
      <PopoverContent
        className="w-56 gap-0 p-0"
        align="start"
        sideOffset={4}
      >
        {/* Search input */}
        <div className="border-b border-border p-2">
          <input
            type="text"
            placeholder="Search people..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 w-full rounded-md bg-transparent px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground"
            autoFocus
          />
        </div>

        {/* Options list */}
        <div className="max-h-56 overflow-y-auto p-1">
          {/* No assignee option */}
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
            onClick={() => handleSelect(null)}
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
              <span className="text-[10px] text-muted-foreground">—</span>
            </div>
            <span className="flex-1 truncate text-muted-foreground">No assignee</span>
            {selectedUserId === null && <CheckIcon />}
          </button>

          {/* Member list */}
          {sorted.map((member) => (
            <button
              key={member.id}
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
              onClick={() => handleSelect(member.id)}
            >
              <UserAvatar user={member} size="sm" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-foreground">{getDisplayName(member)}</span>
                {(member.firstName || member.lastName) && (
                  <span className="truncate text-[10px] text-muted-foreground">{member.email}</span>
                )}
              </div>
              {selectedUserId === member.id && <CheckIcon />}
            </button>
          ))}

          {sorted.length === 0 && search && (
            <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
              No results
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ─── Check Icon ─────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-foreground">
      <path d="M11 4.5L5.5 10L3 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
