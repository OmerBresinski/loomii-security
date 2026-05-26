import React, { useState } from "react"
import {
  Outlet,
  Link,
  useRouterState,
  useNavigate,
} from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
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
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ThemeToggle } from "@/components/theme-toggle"
import { useAuth } from "@/hooks/use-auth"
import { useUnreadCount } from "@/queries/notifications"
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

/** Map route segments to display labels */
const segmentLabels: Record<string, string> = {
  reviews: "Reviews",
  projects: "Projects",
  new: "New",
  threats: "Threat Models",
  policies: "Policies",
  metrics: "Metrics",
  notifications: "Notifications",
  settings: "Settings",
  onboarding: "Onboarding",
}

// ─── Breadcrumb ─────────────────────────────────────────────────────────────

function AppBreadcrumb() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname })
  const queryClient = useQueryClient()

  // Split path into segments, filter out empty strings
  const segments = currentPath.split("/").filter(Boolean)

  if (segments.length === 0) return null

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1
          const href = "/" + segments.slice(0, index + 1).join("/")

          // Resolve dynamic segment labels from cache
          let label: string
          if (segments[index - 1] === "projects" && segment !== "new") {
            // This is a projectId segment — look up the name from cache
            const cached = queryClient.getQueryData<{ name: string }>([
              "projects",
              segment,
            ])
            label = cached?.name ?? segment
          } else {
            label =
              segmentLabels[segment] ??
              segment.charAt(0).toUpperCase() +
                segment.slice(1).replace(/-/g, " ")
          }

          return (
            <React.Fragment key={href}>
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link to={href} />}>
                    {label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getInitials(
  firstName?: string | null,
  lastName?: string | null,
  email?: string
): string {
  if (firstName && lastName) {
    return `${firstName[0]}${lastName[0]}`.toUpperCase()
  }
  if (firstName) {
    return firstName[0].toUpperCase()
  }
  if (email) {
    return email[0].toUpperCase()
  }
  return "?"
}

// ─── Notification Bell ──────────────────────────────────────────────────────

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

function NotificationBell() {
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

// ─── Sidebar ────────────────────────────────────────────────────────────────

function NavIcon({ icon }: { icon?: typeof InboxIcon }) {
  if (!icon) return null
  return <HugeiconsIcon icon={icon} />
}

function AppSidebar() {
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
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-hidden hover:bg-sidebar-accent">
                <Avatar className="size-6 shrink-0">
                  <AvatarFallback className="text-[10px]">
                    {getInitials(user.firstName, user.lastName, user.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-xs font-medium">
                    {user.firstName && user.lastName
                      ? `${user.firstName} ${user.lastName}`
                      : user.email}
                  </span>
                  {role && (
                    <span className="truncate text-[10px] text-muted-foreground">
                      {role.charAt(0) +
                        role.slice(1).toLowerCase().replace("_", " ")}
                    </span>
                  )}
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-48">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-medium">
                        {user.firstName && user.lastName
                          ? `${user.firstName} ${user.lastName}`
                          : "Account"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() =>
                      navigate({ to: "/settings", search: { tab: undefined } })
                    }
                  >
                    Settings
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={logout}>Log out</DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <div className="flex shrink-0 items-center gap-1">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

// ─── Root Layout ────────────────────────────────────────────────────────────

/** Routes that render without the app shell */
const PUBLIC_ROUTES = ["/login", "/auth/callback", "/onboarding"]

export function RootLayout() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname })

  const isPublicRoute = PUBLIC_ROUTES.some((route) =>
    currentPath.startsWith(route)
  )

  if (isPublicRoute) {
    return <Outlet />
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-svh overflow-hidden">
        <header className="flex h-12 shrink-0 items-center border-b border-border/50 px-6">
          <AppBreadcrumb />
        </header>
        <main className="min-h-0 flex-1">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
