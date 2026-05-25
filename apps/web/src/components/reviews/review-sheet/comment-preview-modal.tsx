import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface CommentPreviewModalProps {
  open: boolean
  onClose: () => void
  commentText: string
  targets: Array<{ sourceType: string; sourceId: string; sourceTitle: string }>
  onConfirm: () => void
  isConfirming: boolean
}

export function CommentPreviewModal({
  open,
  onClose,
  commentText,
  targets,
  onConfirm,
  isConfirming,
}: CommentPreviewModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg dark:bg-[#2C2D30]">
        <DialogHeader>
          <DialogTitle className="text-sm">Review comment preview</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Target sources */}
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Posting to
            </p>
            <div className="flex flex-wrap gap-1.5">
              {targets.map((t) => (
                <span
                  key={t.sourceId}
                  className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground/80"
                >
                  {t.sourceType === "linear" ? "Linear" : "Notion"}: {t.sourceTitle}
                </span>
              ))}
            </div>
          </div>

          {/* Comment preview */}
          <div className="rounded-md border border-border/50 bg-muted/30 p-3">
            <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-foreground/90">
              {commentText}
            </pre>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isConfirming}>
            Cancel
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={isConfirming}>
            {isConfirming ? "Sending..." : "Confirm & Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
