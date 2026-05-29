import React from "react"
import { Link, useRouterState } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { timeAgo } from "@/lib/format-time"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { ProjectIconDisplay } from "@/components/projects/icon-picker"
import { useProjectDetail } from "@/queries/projects"

// ─── Segment Labels ─────────────────────────────────────────────────────────

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

// ─── Project Breadcrumb Segment ─────────────────────────────────────────────

/** Reactive project breadcrumb segment — subscribes to project query for live updates */
function ProjectBreadcrumbSegment({ projectId }: { projectId: string }) {
  const { data: project } = useProjectDetail(projectId)

  return (
    <span className="flex items-center gap-2">
      {project && (
        <div className="flex size-5 items-center justify-center">
          <ProjectIconDisplay icon={project.icon} color={project.color} size={14} />
        </div>
      )}
      <BreadcrumbPage>{project?.name ?? projectId}</BreadcrumbPage>
      {project?.summaryUpdatedAt && (
        <span className="text-[11px] text-muted-foreground">
          Updated {timeAgo(project.summaryUpdatedAt)}
        </span>
      )}
    </span>
  )
}

// ─── Breadcrumb Component ───────────────────────────────────────────────────

export function AppBreadcrumbs() {
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
          const isProjectSegment = segments[index - 1] === "projects" && segment !== "new"

          // Project detail segment — render with reactive icon/label
          if (isProjectSegment && isLast) {
            return (
              <React.Fragment key={href}>
                {index > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  <ProjectBreadcrumbSegment projectId={segment} />
                </BreadcrumbItem>
              </React.Fragment>
            )
          }

          // Standard segment
          let label: string
          if (isProjectSegment) {
            const cached = queryClient.getQueryData<{ name: string }>(["projects", segment])
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
