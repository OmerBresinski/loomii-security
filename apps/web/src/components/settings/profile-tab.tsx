import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"

// ─── Profile Tab ────────────────────────────────────────────────────────────

export function ProfileTab() {
  const { user, role, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border/50 bg-[#2C2D30] p-6">
        <div className="flex flex-col gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="rounded-lg border border-border/50 bg-[#2C2D30]">
        <SettingsRow label="Name" value={formatName(user?.firstName, user?.lastName)} />
        <Separator className="opacity-50" />
        <SettingsRow label="Email" value={user?.email ?? "—"} />
        <Separator className="opacity-50" />
        <SettingsRow
          label="Role"
          value={<Badge variant="secondary">{formatRole(role)}</Badge>}
        />
      </div>
      <p className="mt-3 text-[12px] text-muted-foreground">
        Profile information is managed by your identity provider. Contact your
        admin to make changes.
      </p>
    </div>
  )
}

// ─── Settings Row ───────────────────────────────────────────────────────────

function SettingsRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-[13px] font-medium">{value}</span>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatName(
  firstName: string | null | undefined,
  lastName: string | null | undefined
): string {
  const parts = [firstName, lastName].filter(Boolean)
  return parts.length > 0 ? parts.join(" ") : "—"
}

function formatRole(role: string | null): string {
  if (!role) return "Unknown"
  return role.charAt(0) + role.slice(1).toLowerCase().replace("_", " ")
}
