import { useState } from "react"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import {
  useReviewDetail,
  type Review,
  type Finding,
} from "@/queries/reviews"
import {
  useDismissFinding,
  useRestoreFinding,
  usePublishReview,
  useConfirmPublish,
} from "@/mutations/reviews"
import { FindingDetailView } from "./finding-detail-view"
import { ReviewSummaryView } from "./review-summary-view"
import { CommentPreviewModal } from "./comment-preview-modal"
import type { DismissalReason } from "./constants"

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
  const [publishPreview, setPublishPreview] = useState<{
    commentText: string
    targets: Array<{ sourceType: string; sourceId: string; sourceTitle: string }>
  } | null>(null)

  const { data: review, isPending } = useReviewDetail(reviewId, listReview)

  const dismissMutation = useDismissFinding(reviewId)
  const restoreMutation = useRestoreFinding(reviewId)
  const publishMutation = usePublishReview()
  const confirmMutation = useConfirmPublish(reviewId)

  function handleDismiss(findingId: string, reason: DismissalReason) {
    dismissMutation.mutate({ findingId, reason })
    // If we're viewing the dismissed finding, go back to summary
    if (activeFindingId === findingId) {
      setActiveFindingId(null)
    }
  }

  function handleRestore(findingId: string) {
    restoreMutation.mutate({ findingId })
  }

  async function handlePublish() {
    if (!review?.reviewId) return
    const result = await publishMutation.mutateAsync({
      reviewDbId: review.reviewId,
    })
    setPublishPreview({
      commentText: result.commentText,
      targets: result.targets,
    })
  }

  async function handleConfirmPublish() {
    if (!review?.reviewId) return
    await confirmMutation.mutateAsync({ reviewDbId: review.reviewId })
    setPublishPreview(null)
  }

  const isReadOnly = review?.reviewStatus === "PUBLISHED"

  const activeFinding = activeFindingId
    ? (review?.findings.find((f) => f.id === activeFindingId) ?? null)
    : null

  return (
    <>
      {activeFinding ? (
        <FindingDetailView
          finding={activeFinding}
          onBack={() => setActiveFindingId(null)}
          onDismiss={handleDismiss}
          isDismissing={dismissMutation.isPending}
          isReadOnly={isReadOnly}
        />
      ) : (
        <ReviewSummaryView
          review={review}
          isPending={isPending}
          onFindingClick={setActiveFindingId}
          onDismiss={handleDismiss}
          onRestore={handleRestore}
          onPublish={handlePublish}
          isDismissing={dismissMutation.isPending}
          isRestoring={restoreMutation.isPending}
          isPublishing={publishMutation.isPending}
        />
      )}

      {/* Comment preview modal */}
      {publishPreview ? (
        <CommentPreviewModal
          open={!!publishPreview}
          onClose={() => setPublishPreview(null)}
          commentText={publishPreview.commentText}
          targets={publishPreview.targets}
          onConfirm={handleConfirmPublish}
          isConfirming={confirmMutation.isPending}
        />
      ) : null}
    </>
  )
}
