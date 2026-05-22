import { useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchApi } from "@/lib/api-client"
import { reviewKeys } from "@/queries/reviews"

// ─── Types ──────────────────────────────────────────────────────────────────

interface UpdateFindingStatusResponse {
  id: string
  status: string
}

interface UpdateReviewStatusResponse {
  id: string
  status: string
}

// ─── Update Finding Status ──────────────────────────────────────────────────

export function useUpdateFindingStatus(reviewId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["findings", "updateStatus"],
    mutationFn: ({
      findingId,
      status,
    }: {
      findingId: string
      status: "OPEN" | "ACCEPTED" | "REJECTED" | "RESOLVED" | "DEFERRED"
    }) =>
      fetchApi<UpdateFindingStatusResponse>(`/api/v1/findings/${findingId}`, {
        method: "PATCH",
        body: { status },
      }),
    onSuccess: () => {
      // Invalidate the review detail to refetch with updated finding status
      queryClient.invalidateQueries({ queryKey: reviewKeys.detail(reviewId) })
    },
  })
}

// ─── Update Review Status (Approve/Reject) ──────────────────────────────────

export function useUpdateReviewStatus(reviewId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["reviews", "updateStatus", reviewId],
    mutationFn: ({
      reviewDbId,
      status,
    }: {
      reviewDbId: string
      status: "APPROVED" | "REJECTED"
    }) =>
      fetchApi<UpdateReviewStatusResponse>(`/api/v1/reviews/${reviewDbId}`, {
        method: "PATCH",
        body: { status },
      }),
    onSuccess: () => {
      // Invalidate both the detail and list queries
      queryClient.invalidateQueries({ queryKey: reviewKeys.detail(reviewId) })
      queryClient.invalidateQueries({ queryKey: reviewKeys.all })
    },
  })
}
