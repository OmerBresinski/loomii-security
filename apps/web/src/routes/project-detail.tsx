import { useParams } from "@tanstack/react-router"

export default function ProjectDetailPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6">
      <h1 className="text-lg font-semibold">Project Detail</h1>
      <p className="text-sm text-muted-foreground">
        Project <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{projectId}</code> detail page coming soon.
      </p>
    </div>
  )
}
