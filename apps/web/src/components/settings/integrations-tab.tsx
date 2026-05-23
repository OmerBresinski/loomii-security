import { useState } from "react"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useIntegrations, type Integration } from "@/queries/settings"
import { useDisconnectIntegration } from "@/mutations/settings"

// ─── Provider Labels ────────────────────────────────────────────────────────

const providerLabels: Record<string, string> = {
  LINEAR: "Linear",
  NOTION: "Notion",
  GITHUB: "GitHub",
}

const providerFavicons: Record<string, string> = {
  LINEAR: "https://www.google.com/s2/favicons?domain=linear.app&sz=64",
  NOTION: "https://www.google.com/s2/favicons?domain=notion.so&sz=64",
  GITHUB: "https://www.google.com/s2/favicons?domain=github.com&sz=64",
}

const statusVariants: Record<string, "default" | "secondary" | "destructive"> = {
  ACTIVE: "default",
  ERROR: "destructive",
  EXPIRED: "destructive",
}

const statusLabels: Record<string, string> = {
  ACTIVE: "Active",
  ERROR: "Error",
  EXPIRED: "Expired",
}

// ─── Integrations Tab ───────────────────────────────────────────────────────

export function IntegrationsTab() {
  const { data, isPending } = useIntegrations()
  const disconnectMutation = useDisconnectIntegration()
  const [disconnectTarget, setDisconnectTarget] = useState<Integration | null>(
    null
  )

  if (isPending) {
    return (
      <div className="max-w-2xl rounded-lg border border-border/50 bg-muted/50 dark:bg-[#2C2D30] p-5">
        <div className="flex flex-col gap-5">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="size-6 rounded" />
                <div className="flex flex-col gap-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-36" />
                </div>
              </div>
              <Skeleton className="h-8 w-20 rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const integrations = data?.integrations ?? []

  if (integrations.length === 0) {
    return (
      <div className="max-w-2xl rounded-lg border border-border/50 bg-muted/50 dark:bg-[#2C2D30] px-5 py-8">
        <p className="text-center text-sm text-muted-foreground">
          No integrations connected yet.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="max-w-2xl rounded-lg border border-border/50 bg-muted/50 dark:bg-[#2C2D30]">
        {integrations.map((integration, i) => (
          <div key={integration.id}>
            {i > 0 && <Separator className="opacity-50" />}
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <img
                  src={providerFavicons[integration.provider]}
                  alt={providerLabels[integration.provider]}
                  width={20}
                  height={20}
                  className="rounded"
                />
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium">
                      {providerLabels[integration.provider]}
                    </span>
                    <Badge variant={statusVariants[integration.status]}>
                      {statusLabels[integration.status]}
                    </Badge>
                  </div>
                  <span className="text-[12px] text-muted-foreground">
                    {integration.workspaceName} &middot; Connected{" "}
                    {new Date(integration.connectedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDisconnectTarget(integration)}
              >
                Disconnect
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Disconnect Confirmation */}
      <AlertDialog
        open={!!disconnectTarget}
        onOpenChange={(open) => !open && setDisconnectTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect integration?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disconnect{" "}
              <span className="font-medium">
                {disconnectTarget
                  ? providerLabels[disconnectTarget.provider]
                  : ""}
              </span>{" "}
              ({disconnectTarget?.workspaceName}). Sources from this workspace
              will no longer sync automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (disconnectTarget) {
                  disconnectMutation.mutate(disconnectTarget.id)
                  setDisconnectTarget(null)
                }
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
