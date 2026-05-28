import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useProjectDetail, projectReviewsQueryOptions, projectSourcesQueryOptions, projectActivityQueryOptions } from "@/queries/projects"
import { OverviewTab } from "@/components/projects/detail/overview-tab"
import { ReviewsTab } from "@/components/projects/detail/reviews-tab"
import { SourcesTab } from "@/components/projects/detail/sources-tab"
import { ActivityTab } from "@/components/projects/detail/activity-tab"

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

  function prefetchOverview() {
    queryClient.prefetchQuery(projectSourcesQueryOptions(projectId))
    queryClient.prefetchQuery(projectReviewsQueryOptions(projectId))
  }

  function prefetchSources() {
    queryClient.prefetchQuery(projectSourcesQueryOptions(projectId))
  }

  function prefetchReviews() {
    queryClient.prefetchQuery(projectReviewsQueryOptions(projectId, {}))
  }

  function prefetchActivity() {
    queryClient.prefetchQuery(projectActivityQueryOptions(projectId))
  }

  return (
    <div className="flex h-full flex-col overflow-hidden p-6">
      {/* Tabs */}
      <Tabs value={tab} onValueChange={handleTabChange} className="flex min-h-0 flex-1 flex-col">
        <TabsList variant="line">
          <div onMouseEnter={prefetchOverview}>
            <TabsTrigger value="overview">Overview</TabsTrigger>
          </div>
          <div onMouseEnter={prefetchSources}>
            <TabsTrigger value="sources">Sources</TabsTrigger>
          </div>
          <div onMouseEnter={prefetchReviews}>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
          </div>
          <div onMouseEnter={prefetchActivity}>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </div>
        </TabsList>

        <TabsContent value="overview" className="min-h-0 flex-1 overflow-hidden pt-6">
          <OverviewTab projectId={projectId} project={project} isPending={isPending} />
        </TabsContent>

        <TabsContent value="sources" className="min-h-0 flex-1 overflow-y-auto pt-6">
          <SourcesTab projectId={projectId} />
        </TabsContent>

        <TabsContent value="reviews" className="min-h-0 flex-1 overflow-y-auto pt-6">
          <ReviewsTab projectId={projectId} />
        </TabsContent>

        <TabsContent value="activity" className="min-h-0 flex-1 overflow-y-auto pt-6">
          <ActivityTab projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
