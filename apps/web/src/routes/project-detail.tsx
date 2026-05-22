import { useParams } from "@tanstack/react-router"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useProjectDetail } from "@/queries/projects"
import { ProjectHeader } from "@/components/projects/detail/project-header"
import { OverviewTab } from "@/components/projects/detail/overview-tab"

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string }

  const { data, isPending } = useProjectDetail(projectId)
  const project = data

  return (
    <div className="flex h-full flex-col overflow-hidden p-6">
      {/* Header */}
      <div className="pb-4">
        <ProjectHeader project={project} isPending={isPending} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="min-h-0 flex-1 overflow-y-auto pt-6">
          <OverviewTab projectId={projectId} project={project} isPending={isPending} />
        </TabsContent>

        <TabsContent value="sources" className="min-h-0 flex-1 overflow-y-auto pt-6">
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <p className="text-sm font-medium">Sources</p>
            <p className="text-xs text-muted-foreground">
              Source management coming soon.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="reviews" className="min-h-0 flex-1 overflow-y-auto pt-6">
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <p className="text-sm font-medium">Reviews</p>
            <p className="text-xs text-muted-foreground">
              Project reviews coming soon.
            </p>
          </div>
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
