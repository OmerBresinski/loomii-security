import { useMemo } from "react"
import { Pie, PieChart, Cell, Tooltip } from "recharts"
import { Skeleton } from "@/components/ui/skeleton"
import { ChartContainer } from "@/components/ui/chart"
import { useUsage, useDailyUsage } from "@/queries/usage"

// ─── Constants ──────────────────────────────────────────────────────────────

const PIE_COLORS = [
  "oklch(0.72 0.12 280)", // lavender
  "oklch(0.72 0.12 155)", // green
  "oklch(0.75 0.12 70)",  // amber
  "oklch(0.7 0.12 15)",   // rose
  "oklch(0.7 0.15 200)",  // cyan
  "oklch(0.65 0.12 320)", // purple
]

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

// ─── Daily Bar Chart ────────────────────────────────────────────────────────

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

// ─── Custom Tooltip ─────────────────────────────────────────────────────────

interface PieDataItem {
  name: string
  costCents: number
  totalTokens: number
  requests: number
  percentage: number
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: PieDataItem }> }) {
  if (!active || !payload?.length) return null
  const data = payload[0].payload

  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-md">
      <p className="text-[12px] font-medium text-foreground">{data.name}</p>
      <div className="mt-1.5 flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-4 text-[11px]">
          <span className="text-muted-foreground">Cost</span>
          <span className="tabular-nums font-medium">{formatCost(data.costCents)}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-[11px]">
          <span className="text-muted-foreground">Tokens</span>
          <span className="tabular-nums">{formatTokens(data.totalTokens)}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-[11px]">
          <span className="text-muted-foreground">Requests</span>
          <span className="tabular-nums">{data.requests}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-[11px]">
          <span className="text-muted-foreground">Share</span>
          <span className="tabular-nums">{data.percentage.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  )
}

// ─── Pie Chart Card ─────────────────────────────────────────────────────────

function BreakdownPieChart({
  title,
  rows,
}: {
  title: string
  rows: Array<{ label: string; costCents: number; totalTokens: number; requests: number }>
}) {
  const chartData = useMemo(() => {
    const totalCost = rows.reduce((sum, r) => sum + r.costCents, 0)
    return rows.map((row) => ({
      name: row.label,
      costCents: row.costCents,
      totalTokens: row.totalTokens,
      requests: row.requests,
      percentage: totalCost > 0 ? (row.costCents / totalCost) * 100 : 0,
    }))
  }, [rows])

  const chartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {}
    rows.forEach((row, i) => {
      config[row.label] = { label: row.label, color: PIE_COLORS[i % PIE_COLORS.length] }
    })
    return config
  }, [rows])

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h4>
      {rows.length === 0 ? (
        <div className="flex h-[200px] items-center justify-center rounded-md border border-border/50 text-xs text-muted-foreground">
          No data yet.
        </div>
      ) : (
        <div className="rounded-md border border-border/50 p-4">
          <ChartContainer config={chartConfig} className="mx-auto h-[200px] w-full">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="costCents"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={80}
                strokeWidth={2}
                stroke="var(--background)"
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ChartContainer>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
            {chartData.map((item, i) => (
              <div key={item.name} className="flex items-center gap-1.5">
                <div
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                />
                <span className="text-[11px] text-muted-foreground">{item.name}</span>
              </div>
            ))}
          </div>
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
        <Skeleton className="h-[200px] w-full" />
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

      {/* Pie charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BreakdownPieChart title="By Model" rows={modelRows} />
        <BreakdownPieChart title="By Operation" rows={operationRows} />
      </div>
    </div>
  )
}
