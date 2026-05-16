import {
  createRouter,
  createRoute,
  createRootRoute,
  lazyRouteComponent,
} from "@tanstack/react-router"
import { RootLayout } from "@/components/root-layout"

// Root route with layout
const rootRoute = createRootRoute({
  component: RootLayout,
})

// Index redirect to /reviews
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: lazyRouteComponent(() => import("@/routes/reviews")),
})

// Login (public, no sidebar)
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: lazyRouteComponent(() => import("@/routes/login")),
})

// Onboarding
const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  component: lazyRouteComponent(() => import("@/routes/onboarding")),
})

// Reviews
const reviewsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reviews",
  component: lazyRouteComponent(() => import("@/routes/reviews")),
})

// Metrics
const metricsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/metrics",
  component: lazyRouteComponent(() => import("@/routes/metrics")),
})

// Policies
const policiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/policies",
  component: lazyRouteComponent(() => import("@/routes/policies")),
})

// Threats
const threatsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/threats",
  component: lazyRouteComponent(() => import("@/routes/threats")),
})

// Settings
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: lazyRouteComponent(() => import("@/routes/settings")),
})

// Notifications
const notificationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notifications",
  component: lazyRouteComponent(() => import("@/routes/notifications")),
})

// Route tree
const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  onboardingRoute,
  reviewsRoute,
  metricsRoute,
  policiesRoute,
  threatsRoute,
  settingsRoute,
  notificationsRoute,
])

// Create the router
export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
})

// Register router for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
