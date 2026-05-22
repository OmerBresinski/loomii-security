import { useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchApi } from "@/lib/api-client"
import { projectKeys } from "@/queries/projects"
import type { ProjectListItem, ProjectDetail } from "@loomii/shared"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProjectIcon {
  icon: string
  color: string
}

// ─── Hook: optimistic icon update mutation ──────────────────────────────────

export function useUpdateProjectIcon(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (newIcon: ProjectIcon) => {
      return fetchApi<{ id: string; icon: string; color: string }>(
        `/api/v1/projects/${projectId}`,
        {
          method: "PATCH",
          body: { icon: newIcon.icon, color: newIcon.color },
        }
      )
    },

    onMutate: async (newIcon) => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: projectKeys.detail(projectId) })
      await queryClient.cancelQueries({ queryKey: projectKeys.all })

      // Snapshot current cache values
      const previousDetail = queryClient.getQueryData<ProjectDetail>(
        projectKeys.detail(projectId)
      )
      const previousList = queryClient.getQueryData<{ projects: ProjectListItem[] }>(
        projectKeys.all
      )

      // Optimistically update detail cache
      if (previousDetail) {
        queryClient.setQueryData<ProjectDetail>(
          projectKeys.detail(projectId),
          { ...previousDetail, icon: newIcon.icon, color: newIcon.color }
        )
      }

      // Optimistically update list cache
      if (previousList) {
        queryClient.setQueryData<{ projects: ProjectListItem[] }>(
          projectKeys.all,
          {
            projects: previousList.projects.map((p) =>
              p.id === projectId
                ? { ...p, icon: newIcon.icon, color: newIcon.color }
                : p
            ),
          }
        )
      }

      // Return context for rollback
      return { previousDetail, previousList }
    },

    onError: (_err, _newIcon, context) => {
      // Rollback on failure
      if (context?.previousDetail) {
        queryClient.setQueryData(
          projectKeys.detail(projectId),
          context.previousDetail
        )
      }
      if (context?.previousList) {
        queryClient.setQueryData(projectKeys.all, context.previousList)
      }
    },

    onSettled: () => {
      // Refetch to ensure server/client sync
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
      queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}
