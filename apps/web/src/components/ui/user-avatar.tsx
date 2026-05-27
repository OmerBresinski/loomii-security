import { cn } from "@/lib/utils"

// ─── Constants ──────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "#A78BFA", "#67E8F9", "#6EE7B7", "#FCD34D", "#FDBA74", "#F9A8D4", "#EF4444", "#818CF8",
  "#34D399", "#FB923C", "#F472B6", "#38BDF8", "#A3E635", "#FBBF24",
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function getColorFromString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getInitials(firstName: string | null, lastName: string | null, email: string): string {
  if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase()
  if (firstName) return firstName[0].toUpperCase()
  return email[0].toUpperCase()
}

export function getDisplayName(member: { firstName: string | null; lastName: string | null; email: string }): string {
  if (member.firstName || member.lastName) {
    return `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim()
  }
  return member.email
}

// ─── Component ──────────────────────────────────────────────────────────────

interface UserAvatarProps {
  user: { id: string; firstName: string | null; lastName: string | null; email: string }
  size?: "sm" | "md"
  className?: string
}

export function UserAvatar({ user, size = "sm", className }: UserAvatarProps) {
  const initials = getInitials(user.firstName, user.lastName, user.email)
  const bgColor = getColorFromString(user.id)
  const sizeClass = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs"

  return (
    <div
      className={cn("rounded-full flex items-center justify-center font-medium text-white shrink-0", sizeClass, className)}
      style={{ backgroundColor: bgColor }}
    >
      {initials}
    </div>
  )
}
