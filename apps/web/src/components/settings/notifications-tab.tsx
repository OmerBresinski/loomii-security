import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { useNotificationPreferences } from "@/queries/settings"
import { useToggleNotificationPreference } from "@/mutations/settings"

// ─── Notifications Tab ──────────────────────────────────────────────────────

export function NotificationsTab() {
  const { data, isPending } = useNotificationPreferences()
  const toggleMutation = useToggleNotificationPreference()

  if (isPending) {
    return (
      <div className="max-w-2xl rounded-lg border border-border/50 bg-muted/50 dark:bg-[#2C2D30] p-5">
        <div className="flex flex-col gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-5 w-9 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const preferences = data?.preferences ?? []

  if (preferences.length === 0) {
    return (
      <div className="max-w-2xl rounded-lg border border-border/50 bg-muted/50 dark:bg-[#2C2D30] px-5 py-8">
        <p className="text-center text-sm text-muted-foreground">
          No notification preferences available.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl rounded-lg border border-border/50 bg-muted/50 dark:bg-[#2C2D30]">
      {preferences.map((pref, i) => (
        <div key={pref.type}>
          {i > 0 && <Separator className="opacity-50" />}
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex flex-col gap-0.5 pr-4">
              <span className="text-[13px] font-medium">{pref.label}</span>
              <span className="text-[12px] text-muted-foreground">
                {pref.description}
              </span>
            </div>
            <Switch
              checked={pref.enabled}
              onCheckedChange={(checked) =>
                toggleMutation.mutate({
                  type: pref.type,
                  enabled: checked,
                })
              }
            />
          </div>
        </div>
      ))}
    </div>
  )
}
