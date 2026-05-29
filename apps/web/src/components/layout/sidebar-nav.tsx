import { useState } from "react"
import { Link, useRouterState, useNavigate } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  InboxIcon,
  Folder02Icon,
  AlertDiamondIcon,
  ChartLineData01Icon,
  Settings01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  ShieldKeyIcon,
} from "@hugeicons/core-free-icons"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useAuth } from "@/hooks/use-auth"
import { ThemeToggle } from "@/components/theme-toggle"
import { NotificationBell } from "@/components/layout/notification-bell"
import { UserMenu } from "@/components/layout/user-menu"
import type { UserRole } from "@/lib/api-client"

// ─── Nav Configuration ──────────────────────────────────────────────────────

interface NavItem {
  title: string
  href: string
  icon?: typeof InboxIcon
  /** Roles that can see this link. If undefined, visible to all. */
  roles?: UserRole[]
  /** If true, item is visible but non-interactive */
  disabled?: boolean
}

const workspaceItems: NavItem[] = [
  { title: "Reviews", href: "/reviews", icon: InboxIcon, disabled: true },
  { title: "Projects", href: "/projects", icon: Folder02Icon },
  { title: "Threat Models", href: "/threats", icon: AlertDiamondIcon },
]

const governanceItems: NavItem[] = [
  {
    title: "Policies",
    href: "/policies",
    icon: ShieldKeyIcon,
    roles: ["ADMIN", "SECURITY_LEAD"],
  },
  {
    title: "Metrics",
    href: "/metrics",
    icon: ChartLineData01Icon,
    roles: ["ADMIN", "SECURITY_LEAD"],
  },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function NavIcon({ icon }: { icon?: typeof InboxIcon }) {
  if (!icon) return null
  return <HugeiconsIcon icon={icon} />
}

// ─── Sidebar ────────────────────────────────────────────────────────────────

export function SidebarNav() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()
  const { user, role, logout } = useAuth()
  const [workspaceOpen, setWorkspaceOpen] = useState(true)
  const [governanceOpen, setGovernanceOpen] = useState(true)

  const isActive = (href: string) =>
    currentPath === href || currentPath.startsWith(href + "/")

  const filterByRole = (items: NavItem[]) =>
    items.filter((item) => {
      if (!item.roles) return true
      if (!role) return false
      return item.roles.includes(role)
    })

  const visibleGovernanceItems = filterByRole(governanceItems)

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link
          to="/"
          search={{
            status: undefined,
            riskLevel: undefined,
            q: undefined,
            review: undefined,
          }}
          className="flex items-center gap-2 text-sm font-bold"
        >
          Loomii
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {/* ── Workspace group ── */}
        <SidebarGroup className={workspaceOpen ? undefined : "pb-0"}>
          <Collapsible open={workspaceOpen} onOpenChange={setWorkspaceOpen}>
            <CollapsibleTrigger className="flex h-8 w-full items-center gap-1 rounded-xl px-3 text-xs font-medium text-sidebar-foreground/70 select-none hover:bg-sidebar-accent/60 hover:text-sidebar-foreground">
              Workspace
              <HugeiconsIcon
                icon={workspaceOpen ? ArrowDown01Icon : ArrowRight01Icon}
                className="size-3 text-sidebar-foreground/50"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent className="pl-2">
                <SidebarMenu>
                  {workspaceItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      {item.disabled ? (
                        <SidebarMenuButton
                          size="sm"
                          disabled
                          className="pointer-events-none opacity-40"
                        >
                          <NavIcon icon={item.icon} />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton
                          size="sm"
                          render={<Link to={item.href} preload="intent" />}
                          isActive={isActive(item.href)}
                        >
                          <NavIcon icon={item.icon} />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* ── Governance group ── */}
        {visibleGovernanceItems.length > 0 && (
          <SidebarGroup>
            <Collapsible open={governanceOpen} onOpenChange={setGovernanceOpen}>
              <CollapsibleTrigger className="flex h-8 w-full items-center gap-1 rounded-xl px-3 text-xs font-medium text-sidebar-foreground/70 select-none hover:bg-sidebar-accent/60 hover:text-sidebar-foreground">
                Governance
                <HugeiconsIcon
                  icon={governanceOpen ? ArrowDown01Icon : ArrowRight01Icon}
                  className="size-3 text-sidebar-foreground/50"
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent className="pl-2">
                  <SidebarMenu>
                    {visibleGovernanceItems.map((item) => (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          size="sm"
                          render={<Link to={item.href} preload="intent" />}
                          isActive={isActive(item.href)}
                        >
                          <NavIcon icon={item.icon} />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>
        )}

        {/* ── Settings (standalone) ── */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="sm"
                  render={
                    <Link
                      to="/settings"
                      preload="intent"
                      search={{ tab: undefined }}
                    />
                  }
                  isActive={isActive("/settings")}
                >
                  <NavIcon icon={Settings01Icon} />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <div className="flex min-w-0 items-center justify-between gap-1">
          <UserMenu />
          <div className="flex shrink-0 items-center gap-1">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
