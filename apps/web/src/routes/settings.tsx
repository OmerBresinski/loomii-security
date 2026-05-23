import { useCallback } from "react"
import { useSearch, useNavigate } from "@tanstack/react-router"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/hooks/use-auth"
import { ProfileTab } from "@/components/settings/profile-tab"
import { NotificationsTab } from "@/components/settings/notifications-tab"
import { IntegrationsTab } from "@/components/settings/integrations-tab"
import { TeamTab } from "@/components/settings/team-tab"

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { role } = useAuth()
  const search = useSearch({ strict: false }) as { tab?: string }
  const navigate = useNavigate()

  const isAdmin = role === "ADMIN" || role === "SECURITY_LEAD"
  const currentTab = search.tab ?? "profile"

  const handleTabChange = useCallback(
    (value: string) => {
      navigate({
        search: { tab: value === "profile" ? undefined : value } as Record<
          string,
          string | undefined
        >,
        replace: true,
      })
    },
    [navigate]
  )

  return (
    <div className="flex h-full flex-col overflow-hidden p-6">
      {/* Tabs */}
      <Tabs value={currentTab} onValueChange={handleTabChange} className="flex min-h-0 flex-1 flex-col">
        <TabsList variant="line">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
          )}
          {isAdmin && <TabsTrigger value="team">Team</TabsTrigger>}
        </TabsList>

        <TabsContent value="profile" className="min-h-0 flex-1 overflow-y-auto pt-6">
          <ProfileTab />
        </TabsContent>

        <TabsContent value="notifications" className="min-h-0 flex-1 overflow-y-auto pt-6">
          <NotificationsTab />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="integrations" className="min-h-0 flex-1 overflow-y-auto pt-6">
            <IntegrationsTab />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="team" className="min-h-0 flex-1 overflow-y-auto pt-6">
            <TeamTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
