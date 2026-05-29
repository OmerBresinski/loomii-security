import { Link } from "@tanstack/react-router"
import { useUnreadCount } from "@/queries/notifications"

// ─── Bell SVG Icon ──────────────────────────────────────────────────────────

const BellIcon = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
)

// ─── Notification Bell ──────────────────────────────────────────────────────

export function NotificationBell() {
  const { data } = useUnreadCount()
  const unreadCount = data?.count ?? 0

  return (
    <Link
      to="/notifications"
      preload="intent"
      className="relative flex size-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
      aria-label="Notifications"
      search={{ filter: undefined }}
    >
      {BellIcon}
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-[#717CE1] text-[9px] font-medium text-white tabular-nums">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  )
}
