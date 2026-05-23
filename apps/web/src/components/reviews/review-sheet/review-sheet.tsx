import { useState } from "react"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import {
  useReviewDetail,
  type Review,
  type Finding,
} from "@/queries/reviews"
import {
  useUpdateFindingStatus,
  useUpdateReviewStatus,
} from "@/mutations/reviews"
import { FindingDetailView } from "./finding-detail-view"
import { ReviewSummaryView } from "./review-summary-view"

// ─── ReviewSheet Component ──────────────────────────────────────────────────

interface ReviewSheetProps {
  reviewId: string | null
  /** Review from the list — used as placeholder while detail loads */
  listReview?: Review | null
  onClose: () => void
}

export function ReviewSheet({
  reviewId,
  listReview,
  onClose,
}: ReviewSheetProps) {
  const isOpen = !!reviewId

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-[40vw] overflow-hidden sm:max-w-none dark:bg-[#2C2D30]"
      >
        {reviewId && (
          <ReviewSheetContent
            key={reviewId}
            reviewId={reviewId}
            listReview={listReview}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

// ─── Inner Content (keyed by reviewId to auto-reset state) ──────────────────

interface ReviewSheetContentProps {
  reviewId: string
  listReview?: Review | null
}

function ReviewSheetContent({ reviewId, listReview }: ReviewSheetContentProps) {
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null)

  const { data: review, isPending } = useReviewDetail(reviewId, listReview)

  const findingMutation = useUpdateFindingStatus(reviewId)
  const reviewStatusMutation = useUpdateReviewStatus(reviewId)

  function handleFindingStatusChange(
    findingId: string,
    status: Finding["status"]
  ) {
    findingMutation.mutate({ findingId, status })
  }

  function handleAdvance(nextStatus: string) {
    if (!review?.reviewId) return
    reviewStatusMutation.mutate({
      reviewDbId: review.reviewId,
      status: nextStatus as "APPROVED" | "REJECTED",
    })
  }

  function handleReject() {
    if (!review?.reviewId) return
    reviewStatusMutation.mutate({
      reviewDbId: review.reviewId,
      status: "REJECTED",
    })
  }

  const activeFinding = activeFindingId
    ? (review?.findings.find((f) => f.id === activeFindingId) ?? null)
    : null

  return activeFinding ? (
    <FindingDetailView
      finding={activeFinding}
      onBack={() => setActiveFindingId(null)}
      onStatusChange={handleFindingStatusChange}
      isUpdating={
        findingMutation.isPending &&
        findingMutation.variables?.findingId === activeFinding.id
      }
    />
  ) : (
    <ReviewSummaryView
      review={review}
      isPending={isPending}
      onAdvance={handleAdvance}
      onReject={handleReject}
      isStatusUpdating={reviewStatusMutation.isPending}
      onFindingClick={setActiveFindingId}
    />
  )
}
