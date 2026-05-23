import Markdown from "react-markdown"
import { SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import type { Finding } from "@/queries/reviews"
import { FINDING_STATUSES, findingStatusLabels } from "./constants"
import { FindingTypeIcon, FindingSeverityIcon } from "./finding-icons"

// ─── Prose class for markdown content ───────────────────────────────────────

const proseClasses =
  "prose prose-sm max-w-none text-[13px] leading-relaxed text-foreground/90 prose-neutral dark:prose-invert prose-headings:text-sm prose-headings:font-medium prose-p:my-2 prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-[12px] prose-pre:rounded-md prose-pre:bg-muted prose-pre:text-[12px] prose-ol:my-2 prose-ul:my-2 prose-li:my-0.5"

// ─── STRIDE category formatter ──────────────────────────────────────────────

function formatStrideCategory(raw: string): string {
  return raw
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ")
}

// ─── Effort level formatter ─────────────────────────────────────────────────

function formatEffort(raw: string): string {
  return raw.charAt(0) + raw.slice(1).toLowerCase()
}

// ─── Finding Detail View ────────────────────────────────────────────────────

interface FindingDetailViewProps {
  finding: Finding
  onBack: () => void
  onStatusChange: (findingId: string, status: Finding["status"]) => void
  isUpdating: boolean
}

export function FindingDetailView({
  finding,
  onBack,
  onStatusChange,
  isUpdating,
}: FindingDetailViewProps) {
  return (
    <>
      <SheetHeader className="flex h-[130px] flex-col justify-between border-b border-border/50 pb-4">
        {/* Top row: back + icon + title */}
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
          <div className="shrink-0">
            <FindingTypeIcon type={finding.type} />
          </div>
          <SheetTitle className="min-w-0 flex-1 truncate pr-8 text-sm">
            {finding.title}
          </SheetTitle>
        </div>

        {/* Bottom row: metadata left + status select right */}
        <div className="flex items-center justify-between gap-3">
          {/* Left: severity + stride + effort */}
          <div className="flex items-center gap-2.5">
            {finding.severity ? (
              <div className="scale-125">
                <FindingSeverityIcon severity={finding.severity} />
              </div>
            ) : null}
            {finding.strideCategory ? (
              <span className="text-[13px] text-muted-foreground">
                {formatStrideCategory(finding.strideCategory)}
              </span>
            ) : null}
            {finding.strideCategory && finding.effortEstimate ? (
              <span className="text-muted-foreground/30">·</span>
            ) : null}
            {finding.effortEstimate ? (
              <span className="text-[13px] text-muted-foreground">
                {formatEffort(finding.effortEstimate)} effort
              </span>
            ) : null}
          </div>

          {/* Right: status select */}
          <Select
            value={finding.status}
            onValueChange={(val) =>
              onStatusChange(finding.id, val as Finding["status"])
            }
            disabled={isUpdating}
          >
            <SelectTrigger
              size="sm"
              className="h-7 w-fit min-w-[100px] text-[11px]"
            >
              {findingStatusLabels[finding.status] ?? finding.status}
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
        {finding.description ? (
          <div className={proseClasses}>
            <Markdown>{finding.description}</Markdown>
          </div>
        ) : null}
      </div>
    </>
  )
}
