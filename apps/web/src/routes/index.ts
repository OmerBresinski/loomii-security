import {
  createRouter,
  createRoute,
  createRootRoute,
  lazyRouteComponent,
  redirect,
} from "@tanstack/react-router"
import { RootLayout } from "@/components/root-layout"
import { getSessionToken, getStoredRole, getOnboardingCompleted } from "@/lib/api-client"
import { queryClient } from "@/lib/query-client"
import { reviewsInfiniteQueryOptions } from "@/queries/reviews"
import {
  projectsQueryOptions,
  projectDetailQueryOptions,
  projectSourcesQueryOptions,
  projectReviewsQueryOptions,
} from "@/queries/projects"
import { onboardingStateQueryOptions } from "@/queries/onboarding"

// ─── Auth Guard ─────────────────────────────────────────────────────────────

/**
 * beforeLoad guard for protected routes.
 * Checks localStorage for a session token; if absent, redirects to /login.
 * If onboarding is incomplete, redirects to /onboarding.
 * The full validation against the API happens in AuthProvider on mount.
 */
function requireAuth() {
  const token = getSessionToken()
  if (!token) {
    throw redirect({ to: "/login" })
  }
  if (!getOnboardingCompleted()) {
    throw redirect({ to: "/onboarding" })
  }
}

/**
 * beforeLoad guard for the onboarding route.
 * Requires auth but redirects AWAY if onboarding is already done.
 */
function requireOnboarding() {
  const token = getSessionToken()
  if (!token) {
    throw redirect({ to: "/login" })
  }
  if (getOnboardingCompleted()) {
    throw redirect({ to: "/reviews" })
  }
}

/**
 * beforeLoad guard for admin/security-lead-only routes.
 * Developers and viewers are redirected to /reviews.
 */
function requireAdminOrLead() {
  requireAuth()
  const role = getStoredRole()
  if (role && !["ADMIN", "SECURITY_LEAD"].includes(role)) {
    throw redirect({ to: "/reviews" })
  }
}

// ─── Root Route ─────────────────────────────────────────────────────────────

const rootRoute = createRootRoute({
  component: RootLayout,
})

// ─── Public Routes (no auth required) ───────────────────────────────────────

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: lazyRouteComponent(() => import("@/routes/login")),
})

const authCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/callback",
  component: lazyRouteComponent(() => import("@/routes/auth-callback")),
})

// ─── Protected Routes (require auth) ───────────────────────────────────────

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: requireAuth,
  validateSearch: (search: Record<string, unknown>) => ({
    status: search.status as string | undefined,
    riskLevel: search.riskLevel as string | undefined,
    q: search.q as string | undefined,
    review: search.review as string | undefined,
  }),
  component: lazyRouteComponent(() => import("@/routes/reviews")),
})

const reviewsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reviews",
  beforeLoad: requireAuth,
  validateSearch: (search: Record<string, unknown>) => ({
    status: search.status as string | undefined,
    riskLevel: search.riskLevel as string | undefined,
    q: search.q as string | undefined,
    review: search.review as string | undefined,
  }),
  loader: () => {
    // Prefetch the first page of reviews with no filters (default view)
    queryClient.prefetchInfiniteQuery(reviewsInfiniteQueryOptions({}))
  },
  component: lazyRouteComponent(() => import("@/routes/reviews")),
})

const metricsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/metrics",
  beforeLoad: requireAdminOrLead,
  component: lazyRouteComponent(() => import("@/routes/metrics")),
})

const policiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/policies",
  beforeLoad: requireAdminOrLead,
  component: lazyRouteComponent(() => import("@/routes/policies")),
})

const threatsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/threats",
  beforeLoad: requireAuth,
  component: lazyRouteComponent(() => import("@/routes/threats")),
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  beforeLoad: requireAuth,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string) || undefined,
  }),
  component: lazyRouteComponent(() => import("@/routes/settings")),
})

const notificationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notifications",
  beforeLoad: requireAuth,
  validateSearch: (search: Record<string, unknown>) => ({
    filter: (search.filter as string) || undefined,
  }),
  component: lazyRouteComponent(() => import("@/routes/notifications")),
})

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  beforeLoad: requireOnboarding,
  loader: () => {
    queryClient.prefetchQuery(onboardingStateQueryOptions())
  },
  component: lazyRouteComponent(() => import("@/routes/onboarding")),
})

// ─── Projects Routes ────────────────────────────────────────────────────────

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects",
  beforeLoad: requireAuth,
  loader: () => {
    queryClient.prefetchQuery(projectsQueryOptions())
  },
  component: lazyRouteComponent(() => import("@/routes/projects")),
})

const projectNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/new",
  beforeLoad: requireAuth,
  component: lazyRouteComponent(() => import("@/routes/projects-new")),
})

const projectDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId",
  beforeLoad: requireAuth,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string) || "overview",
    review: search.review as string | undefined,
  }),
  loader: ({ params }) => {
    // Prefetch detail, sources, and reviews in parallel (overview is the default tab)
    queryClient.prefetchQuery(projectDetailQueryOptions(params.projectId))
    queryClient.prefetchQuery(projectSourcesQueryOptions(params.projectId))
    queryClient.prefetchQuery(projectReviewsQueryOptions(params.projectId))
  },
  component: lazyRouteComponent(() => import("@/routes/project-detail")),
})

// ─── Route Tree ─────────────────────────────────────────────────────────────

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  authCallbackRoute,
  onboardingRoute,
  reviewsRoute,
  projectsRoute,
  projectNewRoute,    // Must precede $projectId to avoid "new" matching as a param
  projectDetailRoute,
  metricsRoute,
  policiesRoute,
  threatsRoute,
  settingsRoute,
  notificationsRoute,
])

// ─── Router Instance ────────────────────────────────────────────────────────

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
