import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useProjectDetail, projectReviewsQueryOptions } from "@/queries/projects"
import { ProjectHeader } from "@/components/projects/detail/project-header"
import { OverviewTab } from "@/components/projects/detail/overview-tab"
import { ReviewsTab } from "@/components/projects/detail/reviews-tab"
import { SourcesTab } from "@/components/projects/detail/sources-tab"

const routeApi = getRouteApi("/projects/$projectId")

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { projectId } = routeApi.useParams()
  const { tab } = routeApi.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isPending } = useProjectDetail(projectId)
  const project = data

  function handleTabChange(value: string) {
    navigate({
      search: { tab: value === "overview" ? undefined : value },
      replace: true,
    })
  }

  function prefetchReviews() {
    queryClient.prefetchQuery(
      projectReviewsQueryOptions(projectId, {})
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden p-6">
      {/* Header */}
      <div className="pb-4">
        <ProjectHeader project={project} isPending={isPending} />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={handleTabChange} className="flex min-h-0 flex-1 flex-col">
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <div onMouseEnter={prefetchReviews}>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
          </div>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="min-h-0 flex-1 overflow-y-auto pt-6">
          <OverviewTab projectId={projectId} project={project} isPending={isPending} />
        </TabsContent>

        <TabsContent value="sources" className="min-h-0 flex-1 overflow-y-auto pt-6">
          <SourcesTab projectId={projectId} />
        </TabsContent>

        <TabsContent value="reviews" className="min-h-0 flex-1 overflow-y-auto pt-6">
          <ReviewsTab projectId={projectId} />
        </TabsContent>

        <TabsContent value="activity" className="min-h-0 flex-1 overflow-y-auto pt-6">
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <p className="text-sm font-medium">Activity</p>
            <p className="text-xs text-muted-foreground">
              Activity feed coming soon.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
