import { Outlet, Link, useRouterState } from "@tanstack/react-router"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
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

/** Routes that should not show the sidebar/app shell */
const PUBLIC_ROUTES = ["/login", "/auth/callback"]

function AppSidebar() {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  const { user, logout } = useAuth()

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg">
          Loomii
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={currentPath === item.href}
                  >
                    <Link to={item.href} preload="intent">
                      {item.title}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-2">
        {user && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground truncate">
              {user.email}
            </span>
            <button
              onClick={logout}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
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
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
