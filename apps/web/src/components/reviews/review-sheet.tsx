import { useState, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import Markdown from "react-markdown"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowUpRight01Icon,
  Shield01Icon,
  CheckListIcon,
  Wrench01Icon,
  EyeIcon,
} from "@hugeicons/core-free-icons"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  useReviewDetail,
  reviewDetailQueryOptions,
  type Review,
  type ReviewDetail,
  type Finding,
} from "@/queries/reviews"
import {
  useUpdateFindingStatus,
  useUpdateReviewStatus,
} from "@/mutations/reviews"

// ─── Seed cache from list data ──────────────────────────────────────────────

/**
 * Pre-populate the query cache with list-level data so the sheet
 * renders header info instantly without showing a loading skeleton.
 * This is called once when the sheet opens, not on every render.
 */
function seedCacheFromList(
  queryClient: ReturnType<typeof useQueryClient>,
  review: Review
) {
  const key = reviewDetailQueryOptions(review.id).queryKey
  // Only seed if we don't already have real data cached
  if (!queryClient.getQueryData(key)) {
    queryClient.setQueryData<ReviewDetail>(key, {
      id: review.id,
      status: review.status,
      riskLevel: review.riskLevel,
      title: review.title,
      summary: review.summary,
      confidence: null,
      source: review.source,
      externalId: review.externalId,
      reviewId: null,
      reviewStatus: null,
      createdAt: review.createdAt,
      findings: [],
    })
  }
}

// ─── Risk Icon (matches list row icons) ─────────────────────────────────────

const riskLabels: Record<string, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  INFO: "Info",
}

function RiskIcon({ level }: { level: string | null }) {
  if (!level) return null

  if (level === "CRITICAL") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        className="text-muted-foreground text-primary/60 dark:text-muted-foreground"
      >
        <rect width="16" height="16" rx="3" fill="currentColor" />
        <text
          x="8"
          y="12"
          textAnchor="middle"
          fontSize="11"
          fontWeight="bold"
          fill="var(--background)"
        >
          !
        </text>
      </svg>
    )
  }

  const activeBars =
    level === "HIGH" ? 3 : level === "MEDIUM" ? 2 : level === "LOW" ? 1 : 0
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      className="text-primary/60 dark:text-muted-foreground"
    >
      <rect
        x="2"
        y="10"
        width="3"
        height="5"
        rx="0.5"
        fill="currentColor"
        opacity={activeBars >= 1 ? 1 : 0.3}
      />
      <rect
        x="6.5"
        y="6"
        width="3"
        height="9"
        rx="0.5"
        fill="currentColor"
        opacity={activeBars >= 2 ? 1 : 0.3}
      />
      <rect
        x="11"
        y="2"
        width="3"
        height="13"
        rx="0.5"
        fill="currentColor"
        opacity={activeBars >= 3 ? 1 : 0.3}
      />
    </svg>
  )
}

// ─── Review Status Stepper ──────────────────────────────────────────────────

const REVIEW_STEPS = [
  { key: "DRAFT", label: "Draft" },
  { key: "IN_REVIEW", label: "Review" },
  { key: "APPROVED", label: "Approved" },
  { key: "PUBLISHED", label: "Published" },
] as const

function ReviewStepper({
  status,
  onAdvance,
  onReject,
  isUpdating,
}: {
  status: string | null
  onAdvance?: (nextStatus: string) => void
  onReject?: () => void
  isUpdating?: boolean
}) {
  if (!status) return null

  if (status === "REJECTED") {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-400">
          Rejected
        </span>
      </div>
    )
  }

  const currentIdx = REVIEW_STEPS.findIndex((s) => s.key === status)

  // Determine the contextual action for the current step
  const action =
    status === "DRAFT"
      ? { label: "Start Review", next: "IN_REVIEW" }
      : status === "IN_REVIEW"
        ? { label: "Approve", next: "APPROVED" }
        : status === "APPROVED"
          ? { label: "Publish", next: "PUBLISHED" }
          : null

  return (
    <div className="flex min-h-[28px] w-full items-center gap-3">
      {/* Dot stepper */}
      <div className="flex flex-1 items-center">
        {REVIEW_STEPS.map((step, idx) => {
          const isCompleted = idx < currentIdx
          const isCurrent = idx === currentIdx

          const dotColor = isCompleted
            ? "bg-[oklch(0.72_0.12_155)]"
            : isCurrent
              ? "bg-[oklch(0.72_0.12_280)]"
              : "bg-muted-foreground/20"

          const textColor = isCompleted
            ? "text-[oklch(0.72_0.12_155)]"
            : isCurrent
              ? "text-[oklch(0.72_0.12_280)]"
              : "text-muted-foreground/40"

          const lineColor = isCompleted
            ? "bg-[oklch(0.72_0.12_155)]/40"
            : "bg-muted-foreground/15"

          return (
            <div key={step.key} className="flex flex-1 items-center">
              <div className="flex items-center gap-2">
                <div className={`size-2.5 rounded-full ${dotColor}`} />
                <span className={`text-[12px] font-medium ${textColor}`}>
                  {step.label}
                </span>
              </div>
              {idx < REVIEW_STEPS.length - 1 && (
                <div className={`mx-3 h-px flex-1 ${lineColor}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Contextual action buttons */}
      {action && (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => onAdvance?.(action.next)}
            disabled={isUpdating}
            className="rounded-md border border-border bg-transparent px-2.5 py-1 text-[11px] font-medium text-foreground/70 transition-colors hover:border-[oklch(0.72_0.12_155)]/50 hover:text-[oklch(0.72_0.12_155)] disabled:opacity-50"
          >
            {action.label}
          </button>
          {status === "IN_REVIEW" && (
            <button
              onClick={onReject}
              disabled={isUpdating}
              className="rounded-md border border-border bg-transparent px-2.5 py-1 text-[11px] font-medium text-foreground/70 transition-colors hover:border-[oklch(0.7_0.12_15)]/50 hover:text-[oklch(0.7_0.12_15)] disabled:opacity-50"
            >
              Reject
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Finding Helpers ────────────────────────────────────────────────────────

const FINDING_STATUSES = [
  "OPEN",
  "ACCEPTED",
  "REJECTED",
  "RESOLVED",
  "DEFERRED",
] as const

const findingStatusLabels: Record<string, string> = {
  OPEN: "Open",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  RESOLVED: "Resolved",
  DEFERRED: "Deferred",
}

const findingTypeColors: Record<string, string> = {
  THREAT: "text-red-400",
  REQUIREMENT: "text-blue-400",
  MITIGATION: "text-green-400",
  OBSERVATION: "text-amber-400",
}

const findingTypeLabels: Record<string, string> = {
  THREAT: "Threat",
  REQUIREMENT: "Requirement",
  MITIGATION: "Mitigation",
  OBSERVATION: "Observation",
}

const findingTypeIcons: Record<string, any> = {
  THREAT: Shield01Icon,
  REQUIREMENT: CheckListIcon,
  MITIGATION: Wrench01Icon,
  OBSERVATION: EyeIcon,
}

function FindingTypeIcon({ type }: { type: string }) {
  const icon = findingTypeIcons[type]
  const color = findingTypeColors[type] ?? "text-muted-foreground"
  if (!icon) return null
  return (
    <HugeiconsIcon icon={icon} size={16} strokeWidth={1.5} className={color} />
  )
}

function FindingSeverityIcon({ severity }: { severity: string }) {
  // Use same bar-chart style as the review list risk icons
  if (severity === "CRITICAL") {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" className="text-red-400">
        <rect width="16" height="16" rx="3" fill="currentColor" opacity="0.8" />
        <text
          x="8"
          y="12"
          textAnchor="middle"
          fontSize="10"
          fontWeight="bold"
          fill="white"
        >
          !
        </text>
      </svg>
    )
  }

  const activeBars = severity === "HIGH" ? 3 : severity === "MEDIUM" ? 2 : 1
  const color =
    severity === "HIGH"
      ? "text-orange-400"
      : severity === "MEDIUM"
        ? "text-amber-400"
        : "text-green-400"

  return (
    <svg width="14" height="14" viewBox="0 0 16 16" className={color}>
      <rect
        x="2"
        y="10"
        width="3"
        height="5"
        rx="0.5"
        fill="currentColor"
        opacity={activeBars >= 1 ? 1 : 0.25}
      />
      <rect
        x="6.5"
        y="6"
        width="3"
        height="9"
        rx="0.5"
        fill="currentColor"
        opacity={activeBars >= 2 ? 1 : 0.25}
      />
      <rect
        x="11"
        y="2"
        width="3"
        height="13"
        rx="0.5"
        fill="currentColor"
        opacity={activeBars >= 3 ? 1 : 0.25}
      />
    </svg>
  )
}

// ─── Finding List Item (clickable row, no expand) ───────────────────────────

const severityLabels: Record<string, string> = {
  CRITICAL: "Critical severity",
  HIGH: "High severity",
  MEDIUM: "Medium severity",
  LOW: "Low severity",
}

function FindingListItem({
  finding,
  onClick,
}: {
  finding: Finding
  onClick: () => void
}) {
  return (
    <div
      className="group flex h-11 cursor-pointer items-center gap-2.5 border-b border-border/30 px-3 last:border-b-0 hover:bg-accent/50 dark:hover:bg-[#25262A]/50"
      onClick={onClick}
    >
      {/* Severity */}
      {finding.severity && (
        <div className="flex shrink-0 items-center">
          <FindingSeverityIcon severity={finding.severity} />
        </div>
      )}

      {/* Title */}
      <span className="min-w-0 flex-1 truncate text-[13px]">
        {finding.title}
      </span>

      {/* Type Icon with tooltip */}
      <Tooltip>
        <TooltipTrigger>
          <div className="flex shrink-0 items-center">
            <FindingTypeIcon type={finding.type} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {findingTypeLabels[finding.type] ?? finding.type}
        </TooltipContent>
      </Tooltip>

      {/* Arrow icon (shows on hover) */}
      <HugeiconsIcon
        icon={ArrowUpRight01Icon}
        size={14}
        className="shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      />
    </div>
  )
}

// ─── Component ──────────────────────────────────────────────────────────────

interface ReviewSheetProps {
  reviewId: string | null
  /** Review from the list — used to seed cache for instant header */
  listReview?: Review | null
  onClose: () => void
}

export function ReviewSheet({
  reviewId,
  listReview,
  onClose,
}: ReviewSheetProps) {
  const queryClient = useQueryClient()
  const isOpen = !!reviewId
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null)

  // Reset finding view when review changes
  const prevReviewId = useRef(reviewId)
  if (prevReviewId.current !== reviewId) {
    prevReviewId.current = reviewId
    setActiveFindingId(null)
  }

  // Seed cache from list data (only if we don't have detail cached already)
  if (isOpen && listReview) {
    seedCacheFromList(queryClient, listReview)
  }

  const { data: review, isPending } = useReviewDetail(reviewId ?? "")

  const findingMutation = useUpdateFindingStatus(reviewId ?? "")
  const reviewStatusMutation = useUpdateReviewStatus(reviewId ?? "")

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

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-[40vw] overflow-hidden sm:max-w-none dark:bg-[#2C2D30]"
      >
        {activeFinding ? (
          /* ─── Finding Detail View ─────────────────────────────────── */
          <>
            <SheetHeader className="border-b border-border/50 pb-4">
              <div className="flex items-start gap-2">
                {/* Back arrow */}
                <button
                  onClick={() => setActiveFindingId(null)}
                  className="mt-0.5 flex shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M10 12L6 8l4-4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                {/* Type icon next to title */}
                <div className="mt-0.5 shrink-0">
                  <FindingTypeIcon type={activeFinding.type} />
                </div>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="pr-8 text-sm">
                    {activeFinding.title}
                  </SheetTitle>
                   <div className="mt-2 flex flex-wrap items-center gap-2">
                    {/* Severity icon */}
                    {activeFinding.severity && (
                      <FindingSeverityIcon severity={activeFinding.severity} />
                    )}
                    {/* STRIDE */}
                    {activeFinding.strideCategory && (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {activeFinding.strideCategory}
                      </span>
                    )}
                    {/* Effort */}
                    {activeFinding.effortEstimate && (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Effort: {activeFinding.effortEstimate}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Status control */}
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  Status:
                </span>
                <Select
                  value={activeFinding.status}
                  onValueChange={(val) =>
                    handleFindingStatusChange(
                      activeFinding.id,
                      val as Finding["status"]
                    )
                  }
                  disabled={
                    findingMutation.isPending &&
                    findingMutation.variables?.findingId === activeFinding.id
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className="h-7 w-fit min-w-[100px] text-[11px]"
                  >
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {FINDING_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {findingStatusLabels[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </SheetHeader>

            {/* Finding body */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeFinding.description && (
                <div className="prose prose-sm max-w-none text-[13px] leading-relaxed text-foreground/90 prose-neutral dark:prose-invert prose-headings:text-sm prose-headings:font-medium prose-p:my-2 prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-[12px] prose-pre:rounded-md prose-pre:bg-muted prose-pre:text-[12px] prose-ol:my-2 prose-ul:my-2 prose-li:my-0.5">
                  <Markdown>{activeFinding.description}</Markdown>
                </div>
              )}
            </div>
          </>
        ) : (
          /* ─── Review Summary View (default) ───────────────────────── */
          <>
            {/* Header */}
            <SheetHeader className="border-b border-border/50 pb-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <SheetTitle className="pr-8 text-sm">
                    {isPending && !review ? (
                      <Skeleton className="h-4 w-3/4" />
                    ) : (
                      (review?.title ?? "Untitled review")
                    )}
                  </SheetTitle>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {review?.riskLevel && (
                      <RiskIcon level={review.riskLevel} />
                    )}
                    {review?.externalId && (
                      <span className="text-xs text-muted-foreground uppercase">
                        {review.externalId}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Review-level actions */}
              {review?.reviewId && (
                <div className="mt-3">
                  <ReviewStepper
                    status={review.reviewStatus}
                    onAdvance={handleAdvance}
                    onReject={handleReject}
                    isUpdating={reviewStatusMutation.isPending}
                  />
                </div>
              )}
            </SheetHeader>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Summary */}
              {review?.summary && (
                <div className="mb-6">
                  <div className="prose prose-sm max-w-none text-[13px] leading-relaxed text-foreground/90 prose-neutral dark:prose-invert prose-headings:text-sm prose-headings:font-medium prose-p:my-2 prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-[12px] prose-pre:rounded-md prose-pre:bg-muted prose-pre:text-[12px] prose-ol:my-2 prose-ul:my-2 prose-li:my-0.5">
                    <Markdown>{review.summary}</Markdown>
                  </div>
                </div>
              )}

              {/* Findings list */}
              <div>
                <h4 className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Findings ({review?.findings.length ?? 0})
                </h4>

                {isPending && !review ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex h-10 items-center gap-2 px-3"
                      >
                        <Skeleton className="size-3.5 rounded-full" />
                        <Skeleton className="h-3 flex-1" />
                        <Skeleton className="h-4 w-14 rounded-full" />
                      </div>
                    ))}
                  </div>
                ) : review?.findings.length === 0 ? (
                  <p className="py-4 text-center text-[12px] text-muted-foreground">
                    No findings yet.
                  </p>
                ) : (
                  <div className="flex flex-col">
                    {review?.findings.map((finding) => (
                      <FindingListItem
                        key={finding.id}
                        finding={finding}
                        onClick={() => setActiveFindingId(finding.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
