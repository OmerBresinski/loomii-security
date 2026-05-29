import { useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchApi } from "@/lib/api-client"
import { reviewKeys, type ReviewDetail } from "@/queries/reviews"
import type { DismissalReason } from "@/types/reviews"

// ─── Types ──────────────────────────────────────────────────────────────────

interface DismissFindingResponse {
  id: string
  status: "DISMISSED"
  dismissalReason: string
  dismissedAt: string
}

interface RestoreFindingResponse {
  id: string
  status: null
}

interface PublishPreviewResponse {
  commentText: string
  targets: Array<{ sourceType: string; sourceId: string; sourceTitle: string }>
  findingsCount: number
}

interface ConfirmPublishResponse {
  status: "PUBLISHED"
  publishedAt: string
  commentPostedTo: string[]
  findingsConfirmed: number
}

// ─── Dismiss Finding ────────────────────────────────────────────────────────

export function useDismissFinding(reviewId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["findings", "dismiss"],
    mutationFn: ({
      findingId,
      reason,
    }: {
      findingId: string
      reason: DismissalReason
    }) =>
      fetchApi<DismissFindingResponse>(
        `/api/v1/findings/${findingId}/dismiss`,
        { method: "PATCH", body: { reason } }
      ),
    onMutate: async ({ findingId, reason }) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: reviewKeys.detail(reviewId) })
      // Snapshot previous value for rollback
      const previous = queryClient.getQueryData<ReviewDetail>(reviewKeys.detail(reviewId))
      // Optimistically update the cache
      queryClient.setQueryData<ReviewDetail | undefined>(reviewKeys.detail(reviewId), (old) => {
        if (!old) return old
        return {
          ...old,
          findings: old.findings.map((f) =>
            f.id === findingId
              ? { ...f, status: "DISMISSED" as const, dismissalReason: reason }
              : f
          ),
        }
      })
      return { previous }
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData<ReviewDetail | undefined>(reviewKeys.detail(reviewId), context.previous)
      }
    },
    onSettled: () => {
      // Refetch to ensure server consistency
      queryClient.invalidateQueries({ queryKey: reviewKeys.detail(reviewId) })
    },
  })
}

// ─── Restore Finding ────────────────────────────────────────────────────────

export function useRestoreFinding(reviewId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["findings", "restore"],
    mutationFn: ({ findingId }: { findingId: string }) =>
      fetchApi<RestoreFindingResponse>(
        `/api/v1/findings/${findingId}/restore`,
        { method: "PATCH" }
      ),
    onMutate: async ({ findingId }) => {
      await queryClient.cancelQueries({ queryKey: reviewKeys.detail(reviewId) })
      const previous = queryClient.getQueryData<ReviewDetail>(reviewKeys.detail(reviewId))
      queryClient.setQueryData<ReviewDetail | undefined>(reviewKeys.detail(reviewId), (old) => {
        if (!old) return old
        return {
          ...old,
          findings: old.findings.map((f) =>
            f.id === findingId
              ? { ...f, status: null, dismissalReason: null }
              : f
          ),
        }
      })
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData<ReviewDetail | undefined>(reviewKeys.detail(reviewId), context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: reviewKeys.detail(reviewId) })
    },
  })
}

// ─── Publish Review (generate preview) ──────────────────────────────────────

export function usePublishReview() {
  return useMutation({
    mutationKey: ["reviews", "publish"],
    mutationFn: ({ reviewDbId }: { reviewDbId: string }) =>
      fetchApi<PublishPreviewResponse>(
        `/api/v1/reviews/${reviewDbId}/publish`,
        { method: "POST" }
      ),
  })
}

// ─── Confirm Publish (post comment & finalize) ──────────────────────────────

export function useConfirmPublish(reviewId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["reviews", "confirmPublish"],
    mutationFn: ({ reviewDbId }: { reviewDbId: string }) =>
      fetchApi<ConfirmPublishResponse>(
        `/api/v1/reviews/${reviewDbId}/confirm-publish`,
        { method: "POST" }
      ),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: reviewKeys.detail(reviewId) })
      queryClient.invalidateQueries({ queryKey: reviewKeys.all })
    },
  })
}
