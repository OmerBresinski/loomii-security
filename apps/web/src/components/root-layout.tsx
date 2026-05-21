import { Outlet, Link, useRouterState } from "@tanstack/react-router"
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
import { ThemeToggle } from "@/components/theme-toggle"
import { useAuth } from "@/hooks/use-auth"

const navItems = [
  { title: "Reviews", href: "/reviews" },
  { title: "Threat Models", href: "/threats" },
  { title: "Policies", href: "/policies" },
  { title: "Metrics", href: "/metrics" },
  { title: "Notifications", href: "/notifications" },
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

function AppSidebar() {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  const { user, logout } = useAuth()

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
              {navItems.map((item) => (
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
      <SidebarFooter className="space-y-2 p-4">
        {user && (
          <div className="flex items-center justify-between">
            <span className="truncate text-xs text-muted-foreground">
              {user.email}
            </span>
            <button
              onClick={logout}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Logout
            </button>
          </div>
        )}
        <ThemeToggle />
      </SidebarFooter>
    </Sidebar>
  )
}

export function RootLayout() {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  // Public routes render without the app shell (no sidebar)
  const PUBLIC_ROUTES = ["/login", "/auth/callback"]
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
