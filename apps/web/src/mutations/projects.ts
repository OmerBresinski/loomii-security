import { useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchApi } from "@/lib/api-client"
import { projectKeys } from "@/queries/projects"
import type {
  CreateProjectRequest,
  UpdateProjectRequest,
  LinkSourcesRequest,
  ProjectListResponse,
  ProjectDetail,
} from "@loomii/shared"

// ─── Types ──────────────────────────────────────────────────────────────────

interface CreateProjectResponse {
  project: ProjectDetail
}

interface UpdateProjectResponse {
  project: ProjectDetail
}

interface DeleteProjectResponse {
  success: boolean
}

interface LinkSourcesResponse {
  linked: number
}

interface UnlinkSourceResponse {
  success: boolean
}

interface ArchiveSourceResponse {
  success: boolean
}

interface RelinkSourceResponse {
  success: boolean
}

// ─── Create Project ─────────────────────────────────────────────────────────

export function useCreateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["projects", "create"],
    mutationFn: (data: CreateProjectRequest) =>
      fetchApi<CreateProjectResponse>("/api/v1/projects", {
        method: "POST",
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}

// ─── Update Project (Optimistic) ────────────────────────────────────────────

export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["projects", "update", projectId],
    mutationFn: (data: UpdateProjectRequest) =>
      fetchApi<UpdateProjectResponse>(`/api/v1/projects/${projectId}`, {
        method: "PATCH",
        body: data,
      }),
    onMutate: async (data) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: projectKeys.detail(projectId),
      })

      // Snapshot for rollback
      const previousDetail = queryClient.getQueryData<ProjectDetail>(
        projectKeys.detail(projectId)
      )

      // Optimistically update the detail cache
      if (previousDetail) {
        queryClient.setQueryData<ProjectDetail>(
          projectKeys.detail(projectId),
          { ...previousDetail, ...data }
        )
      }

      return { previousDetail }
    },
    onError: (_err, _data, context) => {
      // Rollback on error
      if (context?.previousDetail) {
        queryClient.setQueryData(
          projectKeys.detail(projectId),
          context.previousDetail
        )
      }
    },
    onSettled: () => {
      // Refetch to sync with server
      queryClient.invalidateQueries({
        queryKey: projectKeys.detail(projectId),
      })
      queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}

// ─── Delete Project (Optimistic) ────────────────────────────────────────────

export function useDeleteProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["projects", "delete"],
    mutationFn: (projectId: string) =>
      fetchApi<DeleteProjectResponse>(`/api/v1/projects/${projectId}`, {
        method: "DELETE",
      }),
    onMutate: async (projectId) => {
      await queryClient.cancelQueries({ queryKey: projectKeys.all })

      const previousList =
        queryClient.getQueryData<ProjectListResponse>(projectKeys.all)

      // Optimistically remove from list
      if (previousList) {
        queryClient.setQueryData<ProjectListResponse>(projectKeys.all, {
          projects: previousList.projects.filter((p) => p.id !== projectId),
        })
      }

      return { previousList }
    },
    onError: (_err, _projectId, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(projectKeys.all, context.previousList)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}

// ─── Link Sources ───────────────────────────────────────────────────────────

export function useLinkSources(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["projects", projectId, "sources", "link"],
    mutationFn: (data: LinkSourcesRequest) =>
      fetchApi<LinkSourcesResponse>(
        `/api/v1/projects/${projectId}/sources`,
        { method: "POST", body: data }
      ),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.sources(projectId),
      })
      queryClient.invalidateQueries({
        queryKey: projectKeys.detail(projectId),
      })
      queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}

// ─── Unlink Source ──────────────────────────────────────────────────────────

export function useUnlinkSource(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["projects", projectId, "sources", "unlink"],
    mutationFn: (sourceId: string) =>
      fetchApi<UnlinkSourceResponse>(
        `/api/v1/projects/${projectId}/sources/${sourceId}`,
        { method: "DELETE" }
      ),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.sources(projectId),
      })
      queryClient.invalidateQueries({
        queryKey: projectKeys.detail(projectId),
      })
      queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}

// ─── Archive Source (Optimistic) ────────────────────────────────────────────

export function useArchiveSource(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["projects", projectId, "sources", "archive"],
    mutationFn: ({
      sourceId,
      isArchived,
    }: {
      sourceId: string
      isArchived: boolean
    }) =>
      fetchApi<ArchiveSourceResponse>(
        `/api/v1/projects/${projectId}/sources/${sourceId}`,
        { method: "PATCH", body: { isArchived } }
      ),
    onMutate: async ({ sourceId, isArchived }) => {
      await queryClient.cancelQueries({
        queryKey: projectKeys.sources(projectId),
      })

      const previousSources = queryClient.getQueryData<{
        sources: Array<{ id: string; isArchived: boolean }>
      }>(projectKeys.sources(projectId))

      // Optimistically toggle archive status
      if (previousSources) {
        queryClient.setQueryData(projectKeys.sources(projectId), {
          sources: previousSources.sources.map((s) =>
            s.id === sourceId ? { ...s, isArchived } : s
          ),
        })
      }

      return { previousSources }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousSources) {
        queryClient.setQueryData(
          projectKeys.sources(projectId),
          context.previousSources
        )
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.sources(projectId),
      })
    },
  })
}

// ─── Relink Source ──────────────────────────────────────────────────────────

export function useRelinkSource(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["projects", projectId, "sources", "relink"],
    mutationFn: (data: { sourceId: string; targetProjectId: string }) =>
      fetchApi<RelinkSourceResponse>(
        `/api/v1/projects/${projectId}/sources/relink`,
        { method: "POST", body: data }
      ),
    onSettled: (_data, _err, variables) => {
      // Invalidate both source and target project
      queryClient.invalidateQueries({
        queryKey: projectKeys.sources(projectId),
      })
      queryClient.invalidateQueries({
        queryKey: projectKeys.detail(projectId),
      })
      queryClient.invalidateQueries({
        queryKey: projectKeys.sources(variables.targetProjectId),
      })
      queryClient.invalidateQueries({
        queryKey: projectKeys.detail(variables.targetProjectId),
      })
      queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}
