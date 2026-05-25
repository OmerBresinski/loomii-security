import { useMemo } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { useUsage, useDailyUsage } from "@/queries/usage"

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCost(cents: number): string {
  if (cents === 0) return "$0.00"
  const dollars = cents / 100
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`
  return `$${dollars.toFixed(2)}`
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
  return String(count)
}

// ─── Stats Card ─────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-6 first:pl-0">
      <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="text-lg font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  )
}

// ─── Bar Chart (simple, no dependency) ──────────────────────────────────────

function CostChart({ daily }: { daily: Array<{ date: string; costCents: number }> }) {
  const maxCost = useMemo(() => Math.max(...daily.map((d) => d.costCents), 0.01), [daily])

  if (daily.length === 0) {
    return (
      <div className="flex h-[160px] items-center justify-center text-xs text-muted-foreground">
        No usage data yet.
      </div>
    )
  }

  return (
    <div className="flex h-[160px] items-end gap-[2px]">
      {daily.map((d) => {
        const height = Math.max((d.costCents / maxCost) * 100, 2)
        return (
          <div
            key={d.date}
            className="group relative flex-1"
            title={`${d.date}: ${formatCost(d.costCents)}`}
          >
            <div
              className="w-full rounded-sm bg-primary/60 transition-colors group-hover:bg-primary"
              style={{ height: `${height}%` }}
            />
          </div>
        )
      })}
    </div>
  )
}

// ─── Breakdown Table ────────────────────────────────────────────────────────

function BreakdownTable({
  title,
  rows,
  labelKey,
}: {
  title: string
  rows: Array<{ label: string; costCents: number; totalTokens: number; requests: number }>
  labelKey: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h4>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No data yet.</p>
      ) : (
        <div className="flex flex-col rounded-md border border-border/50">
          {/* Header */}
          <div className="flex h-8 items-center border-b border-border/30 px-3 text-[11px] font-medium text-muted-foreground">
            <span className="flex-1">{labelKey}</span>
            <span className="w-20 text-right">Tokens</span>
            <span className="w-16 text-right">Calls</span>
            <span className="w-20 text-right">Cost</span>
          </div>
          {/* Rows */}
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex h-9 items-center border-b border-border/30 px-3 last:border-b-0 text-[12px]"
            >
              <span className="flex-1 truncate font-mono text-[11px]">{row.label}</span>
              <span className="w-20 text-right tabular-nums text-muted-foreground">
                {formatTokens(row.totalTokens)}
              </span>
              <span className="w-16 text-right tabular-nums text-muted-foreground">
                {row.requests}
              </span>
              <span className="w-20 text-right tabular-nums font-medium">
                {formatCost(row.costCents)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Usage Tab ──────────────────────────────────────────────────────────────

export function UsageTab() {
  const { data: usage, isPending } = useUsage()
  const { data: dailyData } = useDailyUsage()

  if (isPending) {
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <div className="flex items-center divide-x divide-border/50 py-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-0.5 px-6 first:pl-0">
              <Skeleton className="h-[11px] w-20" />
              <Skeleton className="h-7 w-16" />
            </div>
          ))}
        </div>
        <Skeleton className="h-[160px] w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  const modelRows = (usage?.byModel ?? []).map((m) => ({
    label: m.model ?? "unknown",
    costCents: m.costCents,
    totalTokens: m.totalTokens,
    requests: m.requests,
  }))

  const operationRows = (usage?.byOperation ?? []).map((o) => ({
    label: o.operation ?? "unknown",
    costCents: o.costCents,
    totalTokens: o.totalTokens,
    requests: o.requests,
  }))

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {/* Stats row */}
      <div className="flex items-center divide-x divide-border/50 py-4">
        <StatCard label="Cost (30d)" value={formatCost(usage?.last30Days.costCents ?? 0)} />
        <StatCard label="Total Cost" value={formatCost(usage?.allTime.costCents ?? 0)} />
        <StatCard label="Tokens (30d)" value={formatTokens(usage?.last30Days.totalTokens ?? 0)} />
        <StatCard label="Requests (30d)" value={String(usage?.last30Days.requests ?? 0)} />
      </div>

      {/* Daily cost chart */}
      <div className="flex flex-col gap-2">
        <h4 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Daily Cost (last 30 days)
        </h4>
        <div className="rounded-md border border-border/50 p-4">
          <CostChart daily={dailyData?.daily ?? []} />
        </div>
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BreakdownTable title="By Model" rows={modelRows} labelKey="Model" />
        <BreakdownTable title="By Operation" rows={operationRows} labelKey="Operation" />
      </div>
    </div>
  )
}
