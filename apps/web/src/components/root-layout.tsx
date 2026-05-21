import { Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router"
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
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
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
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/theme-toggle"
import { useAuth } from "@/hooks/use-auth"
import { useNotificationsStore } from "@/stores/notifications"
import type { UserRole } from "@/lib/api-client"

// ─── Nav Configuration ──────────────────────────────────────────────────────

interface NavItem {
  title: string
  href: string
  /** Roles that can see this link. If undefined, visible to all. */
  roles?: UserRole[]
}

const navItems: NavItem[] = [
  { title: "Reviews", href: "/reviews" },
  { title: "Threat Models", href: "/threats" },
  { title: "Policies", href: "/policies", roles: ["ADMIN", "SECURITY_LEAD"] },
  { title: "Metrics", href: "/metrics", roles: ["ADMIN", "SECURITY_LEAD"] },
  { title: "Settings", href: "/settings" },
]

/** Map route paths to display labels */
const routeLabels: Record<string, string> = {
  "/reviews": "Reviews",
  "/threats": "Threat Models",
  "/policies": "Policies",
  "/metrics": "Metrics",
  "/notifications": "Notifications",
  "/settings": "Settings",
  "/onboarding": "Onboarding",
}

// ─── Breadcrumb ─────────────────────────────────────────────────────────────

function AppBreadcrumb() {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  const label = routeLabels[currentPath] ?? currentPath.replace("/", "")

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbPage>{label}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getInitials(firstName?: string | null, lastName?: string | null, email?: string): string {
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

function NotificationBell() {
  const unreadCount = useNotificationsStore((s) => s.unreadCount)

  return (
    <Link
      to="/notifications"
      preload="intent"
      className="relative flex size-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
      aria-label="Notifications"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unreadCount > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full p-0 text-[9px]"
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </Badge>
      )}
    </Link>
  )
}

// ─── Sidebar ────────────────────────────────────────────────────────────────

function AppSidebar() {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  const navigate = useNavigate()
  const { user, role, logout } = useAuth()

  // Filter nav items by role
  const visibleNavItems = navItems.filter((item) => {
    if (!item.roles) return true
    if (!role) return false
    return item.roles.includes(role)
  })

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold">
          Loomii
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link to={item.href} preload="intent" />}
                    isActive={currentPath === item.href}
                  >
                    {item.title}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
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
                      {role.charAt(0) + role.slice(1).toLowerCase().replace("_", " ")}
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
                    onClick={() => navigate({ to: "/settings" })}
                  >
                    Settings
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={logout}>
                    Log out
                  </DropdownMenuItem>
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
const PUBLIC_ROUTES = ["/login", "/auth/callback"]

export function RootLayout() {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  const isPublicRoute = PUBLIC_ROUTES.some((route) =>
    currentPath.startsWith(route)
  )

  if (isPublicRoute) {
    return <Outlet />
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 items-center border-b px-6">
          <AppBreadcrumb />
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
