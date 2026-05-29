import { Outlet, useRouterState } from "@tanstack/react-router"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { SidebarNav } from "@/components/layout/sidebar-nav"
import { AppBreadcrumbs } from "@/components/layout/app-breadcrumbs"

// ─── Root Layout ────────────────────────────────────────────────────────────

/** Routes that render without the app shell */
const PUBLIC_ROUTES = ["/login", "/auth/callback", "/onboarding"]

export function RootLayout() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname })

  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => currentPath === route || currentPath.startsWith(route + "/")
  )

  if (isPublicRoute) {
    return <Outlet />
  }

  return (
    <SidebarProvider>
      <SidebarNav />
      <SidebarInset className="h-svh overflow-hidden">
        <header className="flex h-12 shrink-0 items-center border-b border-border/50 px-6">
          <AppBreadcrumbs />
        </header>
        <main className="min-h-0 flex-1">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
