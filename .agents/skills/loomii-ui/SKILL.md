---
name: loomii-ui
description: Loomii design system and UI patterns for building consistent security dashboard interfaces. Use when creating new pages, components, list views, detail sheets, filters, toolbars, empty states, or any frontend UI in this application. Triggers on UI work, new pages, component creation, styling, layout, or when matching existing design patterns.
---

# Loomii UI Design System

This skill documents the complete design system, component patterns, layout conventions, and color tokens used across the Loomii security platform. Follow these patterns exactly when building new UI.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Routing | TanStack Router (file-based, lazy routes) |
| State/Data | TanStack Query v5 (infinite queries, prefetching) |
| Virtualization | @tanstack/react-virtual |
| Components | shadcn/ui (Base UI primitives, CVA variants) |
| Icons | @hugeicons/react + @hugeicons/core-free-icons |
| Styling | Tailwind CSS v4 (CSS-first config, no tailwind.config.ts) |
| Markdown | react-markdown |
| Fonts | Figtree Variable (body), Roboto Slab Variable (headings) |

---

## Color System (CSS Custom Properties)

### Dark Mode (Primary - `.dark`)

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `#1F2023` | Page background |
| `--foreground` | `oklch(0.985 0 0)` | Primary text |
| `--card` | `oklch(0.18 0.006 260)` | Card surfaces |
| `--popover` | `#2C2D30` | Popover/dropdown/sheet bg |
| `--primary` | `oklch(0.424 0.199 265.638)` | Primary brand (dark indigo) |
| `--secondary` | `oklch(0.28 0.006 260)` | Secondary surfaces |
| `--muted` | `oklch(0.275 0.006 260)` | Muted backgrounds |
| `--muted-foreground` | `oklch(0.708 0 0)` | Secondary text, timestamps |
| `--accent` | `oklch(0.275 0.006 260)` | Hover backgrounds |
| `--destructive` | `oklch(0.704 0.191 22.216)` | Error/danger |
| `--border` | `oklch(1 0 0 / 10%)` | Borders |
| `--input` | `oklch(1 0 0 / 15%)` | Input borders |
| `--sidebar` | `#191A1C` | Sidebar background |
| `--sidebar-border` | `oklch(1 0 0 / 10%)` | Sidebar dividers |

### Light Mode (`:root`)

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `oklch(1 0 0)` | White |
| `--foreground` | `oklch(0.145 0 0)` | Near-black text |
| `--primary` | `oklch(0.488 0.243 264.376)` | Deep indigo/blue |
| `--muted` | `oklch(0.97 0 0)` | Light gray surfaces |
| `--muted-foreground` | `oklch(0.556 0 0)` | Gray text |
| `--border` | `oklch(0.922 0 0)` | Light borders |

### Hardcoded Dark Mode Colors (used inline)

| Color | Hex/Value | Context |
|-------|-----------|---------|
| Row hover (dark) | `#25262A` | `dark:hover:bg-[#25262A]` on list rows |
| Sheet/popover bg | `#2C2D30` | `dark:bg-[#2C2D30]` on SheetContent |
| Popover border | `#3A3B3F` | Icon picker popover border |
| Primary button | `#2C7FFF` | "New project" button, CTA blue |

### Semantic Status Colors (OKLCH)

| Status | Color | OKLCH Value |
|--------|-------|-------------|
| Approved/Published (green) | Soft green | `oklch(0.72 0.12 155)` |
| Rejected (rose) | Soft rose | `oklch(0.7 0.12 15)` |
| In Review (lavender) | Soft purple | `oklch(0.72 0.12 280)` |
| Draft (amber) | Soft amber | `oklch(0.75 0.12 70)` |
| Generating (gray) | Neutral gray | `oklch(0.6 0.02 260)` |
| Pending (light gray) | Very soft gray | `oklch(0.55 0.01 260)` |

### Notification Type Colors (Hex)

| Type | Color | Hex |
|------|-------|-----|
| review_completed | Cyan | `#67E8F9` |
| high_risk_detected | Red | `#F87171` |
| source_linked | Green | `#6EE7B7` |
| source_archived | Yellow | `#FCD34D` |
| summary_updated | Purple | `#A78BFA` |

### Finding Type Colors (Tailwind)

| Type | Class |
|------|-------|
| THREAT | `text-red-400` |
| REQUIREMENT | `text-blue-400` |
| MITIGATION | `text-green-400` |
| OBSERVATION | `text-amber-400` |

### Finding Severity Colors

| Severity | Class |
|----------|-------|
| CRITICAL | `text-red-400` |
| HIGH | `text-orange-400` |
| MEDIUM | `text-amber-400` |
| LOW | `text-green-400` |

### Project Icon Preset Colors

```
#A1A1AA, #A78BFA, #67E8F9, #6EE7B7, #FCD34D, #FDBA74, #F9A8D4, #EF4444
```

---

## Layout Architecture

### Shell Structure

```
SidebarProvider
+-- AppSidebar (width: 15.4rem, mobile: 17rem, collapsed: 3rem)
+-- SidebarInset (h-svh, overflow-hidden)
    +-- <header> (h-12, border-b, AppBreadcrumb)
    +-- <main> (min-h-0, flex-1)
        +-- <Outlet /> (route content)
```

### Page Layout Pattern (Every Page)

Every page uses this exact wrapper:

```tsx
<div className="flex h-full flex-col overflow-hidden p-6">
  {/* Toolbar area */}
  <div className="flex items-center gap-3 pb-4">
    {/* Search, filters, actions */}
  </div>

  {/* Content area - fills remaining space */}
  {isPending ? (
    <LoadingSkeleton />
  ) : items.length === 0 ? (
    <EmptyState />
  ) : (
    <div className="flex min-h-0 flex-1 flex-col rounded-md">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Virtualized or static list */}
      </div>
    </div>
  )}
</div>
```

Key layout classes:
- Page container: `flex h-full flex-col overflow-hidden p-6`
- Toolbar: `flex items-center gap-3 pb-4`
- Scrollable content wrapper: `flex min-h-0 flex-1 flex-col rounded-md`
- Inner scroll: `min-h-0 flex-1 overflow-y-auto`

---

## Component Patterns

### List Rows

All list rows share this exact pattern:

```tsx
<div className="flex h-12 cursor-pointer items-center px-4 hover:bg-accent dark:hover:bg-[#25262A]">
  {/* Fixed-width icon column */}
  <div className="flex w-8 shrink-0 items-center justify-center">
    {/* Icon with Tooltip wrapper */}
  </div>

  {/* Title - flexible width */}
  <div className="flex min-w-0 flex-1 items-center pr-4 pl-2">
    <span className="truncate text-[13px]">{title}</span>
  </div>

  {/* Right-aligned metadata columns */}
  <div className="flex w-20 shrink-0 items-center justify-end text-[11px] text-muted-foreground">
    {/* count or label */}
  </div>

  {/* Timestamp */}
  <div className="flex w-16 shrink-0 items-center justify-end text-[11px] text-muted-foreground">
    {timeAgo(date)}
  </div>
</div>
```

Row specifications:
- Height: `h-12` (48px)
- Horizontal padding: `px-4`
- Hover: `hover:bg-accent dark:hover:bg-[#25262A]`
- Unread indicator: `bg-accent/30` (notifications)
- Title font: `text-[13px]`
- Metadata font: `text-[11px] text-muted-foreground`
- Icon column width: `w-8`
- Fixed columns: use specific widths (`w-16`, `w-20`, etc.) with `shrink-0`
- Flexible title: `min-w-0 flex-1`

### Virtualized Lists

Uses `@tanstack/react-virtual` with IntersectionObserver for infinite scroll:

```tsx
const virtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 48,  // matches h-12
  overscan: 5,
})

// Container
<div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto">
  <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
    {virtualItems.map((virtualRow) => (
      <div
        key={virtualRow.key}
        className="absolute left-0 top-0 w-full"
        style={{
          height: `${virtualRow.size}px`,
          transform: `translateY(${virtualRow.start}px)`,
        }}
      >
        <RowComponent item={items[virtualRow.index]} />
      </div>
    ))}
  </div>
  {/* Infinite scroll sentinel */}
  <div ref={sentinelRef} aria-hidden className="h-px" />
</div>
```

### Loading More Indicator

```tsx
{isFetchingNextPage && (
  <div className="flex h-12 items-center justify-center text-xs text-muted-foreground">
    Loading more...
  </div>
)}
```

---

## Search Component Pattern

Debounced search input (300ms):

```tsx
<Input
  type="search"
  placeholder="Search {entity}..."
  value={localValue}
  onChange={(e) => setLocalValue(e.target.value)}
  className="h-8 w-64 text-xs"
/>
```

Specifications:
- Height: `h-8`
- Width: `w-64`
- Font: `text-xs`
- Debounce: 300ms timeout before emitting onChange
- Syncs with external value (URL params)

---

## Filter Pattern (Multi-Select Popovers)

```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline" size="sm" className="h-8 text-xs">
      {label}
      {selected.length > 0 && (
        <Badge variant="secondary" className="ml-1.5 px-1 py-0 text-[10px] tabular-nums">
          {selected.length}
        </Badge>
      )}
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-48 p-0" align="start">
    <Command>
      <CommandList>
        <CommandGroup>
          {options.map((option) => (
            <CommandItem className="cursor-pointer">
              <div className="flex items-center gap-2">
                {/* Checkbox square */}
                <div className={`flex size-4 items-center justify-center rounded-sm border ${
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/30"
                }`}>
                  {isSelected && <CheckSvg />}
                </div>
                <span className="text-xs">{option.label}</span>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
```

Clear button (appears/disappears based on active filters):
```tsx
<Button
  variant="ghost"
  size="sm"
  className={`h-8 text-xs text-muted-foreground transition-none ${
    hasActiveFilters ? "opacity-100" : "opacity-0 pointer-events-none"
  }`}
>
  Clear
</Button>
```

---

## Tabs Pattern

Uses `variant="line"` for page-level tabs:

```tsx
<Tabs value={activeTab} onValueChange={handleTabChange} className="flex min-h-0 flex-1 flex-col">
  <TabsList variant="line">
    <div onMouseEnter={prefetchData}>
      <TabsTrigger value="overview">Overview</TabsTrigger>
    </div>
    {/* More triggers wrapped in hover-prefetch divs */}
  </TabsList>

  <TabsContent value="overview" className="min-h-0 flex-1 overflow-y-auto pt-6">
    {/* Tab content */}
  </TabsContent>
</Tabs>
```

Tab variants:
- `variant="line"`: Underline indicator, transparent bg, used for page-level navigation
- `variant="default"`: Pill/rounded style with `bg-muted` background

Line tabs show an `after:` pseudo-element underline on active state using:
```
after:absolute after:bg-foreground after:opacity-0 after:h-0.5 after:bottom-[-5px]
data-active:after:opacity-100
```

---

## Sheet (Side Drawer) Pattern

Right-side sheet for detail views:

```tsx
<Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
  <SheetContent
    side="right"
    className="w-[40vw] overflow-hidden sm:max-w-none dark:bg-[#2C2D30]"
  >
    {/* Content keyed by ID for state reset */}
    <SheetContentInner key={entityId} />
  </SheetContent>
</Sheet>
```

Sheet specifications:
- Width: `w-[40vw]`
- No max-width: `sm:max-w-none`
- Dark background: `dark:bg-[#2C2D30]`
- Content is keyed by entity ID to auto-reset internal state

### Sheet Header Pattern

```tsx
<SheetHeader className="border-b border-border/50 pb-4">
  <div className="flex items-start gap-3">
    <div className="min-w-0 flex-1">
      <SheetTitle className="pr-8 text-sm">
        {title}
      </SheetTitle>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {/* Metadata badges/icons */}
      </div>
    </div>
  </div>
</SheetHeader>
```

### Sheet Body

```tsx
<div className="flex-1 overflow-y-auto p-6">
  {/* Scrollable content */}
</div>
```

---

## Empty State Pattern

```tsx
<div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-md p-6 text-center">
  <p className="text-sm font-medium">{title}</p>
  <p className="text-xs text-muted-foreground">
    {description}
  </p>
</div>
```

Larger empty state (with icon and CTA):
```tsx
<div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-md p-12 text-center">
  <div className="flex size-12 items-center justify-center rounded-lg bg-muted">
    <svg className="text-muted-foreground" ... />
  </div>
  <div className="flex flex-col gap-1">
    <p className="text-sm font-medium">{title}</p>
    <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
  </div>
  <Button asChild size="sm" className="mt-2">
    <Link to="/create">{ctaLabel}</Link>
  </Button>
</div>
```

---

## Loading Skeleton Pattern

List skeleton (12 rows for full page, 8 for smaller):
```tsx
<div className="flex flex-col rounded-md">
  {Array.from({ length: 12 }).map((_, i) => (
    <div key={i} className="flex h-12 items-center px-4">
      <Skeleton className="h-4 w-full max-w-md" />
    </div>
  ))}
</div>
```

Finding skeleton:
```tsx
<div className="space-y-2">
  {Array.from({ length: 3 }).map((_, i) => (
    <div key={i} className="flex h-10 items-center gap-2 px-3">
      <Skeleton className="size-3.5 rounded-full" />
      <Skeleton className="h-3 flex-1" />
      <Skeleton className="h-4 w-14 rounded-full" />
    </div>
  ))}
</div>
```

Stats skeleton:
```tsx
<div className="flex items-center divide-x divide-border/50 py-4">
  {Array.from({ length: 4 }).map((_, i) => (
    <div key={i} className="flex flex-col gap-0.5 px-6 first:pl-0">
      <Skeleton className="h-[11px] w-20" />
      <Skeleton className="h-7 w-8" />
    </div>
  ))}
</div>
```

---

## Tooltip Pattern

Every icon with meaning gets a tooltip:

```tsx
<Tooltip>
  <TooltipTrigger>
    <div className="flex w-8 shrink-0 items-center justify-center">
      <Icon />
    </div>
  </TooltipTrigger>
  <TooltipContent side="top" className="text-xs">
    {label}
  </TooltipContent>
</Tooltip>
```

---

## Badge Pattern

Secondary badge for metadata labels:
```tsx
<Badge
  variant="secondary"
  className="text-[11px] font-normal hover:bg-secondary/80"
>
  {label}
</Badge>
```

Count badge on filter buttons:
```tsx
<Badge variant="secondary" className="ml-1.5 px-1 py-0 text-[10px] tabular-nums">
  {count}
</Badge>
```

---

## Button Patterns

### Primary CTA Button
```tsx
<Button
  size="sm"
  className="size-8 bg-[#2C7FFF] p-0 text-white hover:bg-[#2C7FFF]/90"
>
  {/* Plus icon */}
</Button>
```

### Ghost Action Button
```tsx
<Button
  variant="ghost"
  size="sm"
  className="h-8 text-xs text-muted-foreground"
>
  {label}
</Button>
```

### Stepper Action Buttons (minimal border style)
```tsx
<button className="rounded-md border border-border bg-transparent px-2.5 py-1 text-[11px] font-medium text-foreground/70 transition-colors hover:border-[oklch(0.72_0.12_155)]/50 hover:text-[oklch(0.72_0.12_155)] disabled:opacity-50">
  {label}
</button>
```

---

## Icon System

### Icon Library: Hugeicons

```tsx
import { HugeiconsIcon } from "@hugeicons/react"
import { Shield01Icon } from "@hugeicons/core-free-icons"

<HugeiconsIcon icon={Shield01Icon} size={16} strokeWidth={1.5} color="#67E8F9" />
// or with className for Tailwind colors:
<HugeiconsIcon icon={Shield01Icon} size={16} strokeWidth={1.5} className="text-red-400" />
```

Standard icon sizes:
- List row icons: `size={16}`
- Header icons: `size={20}`
- Empty state icons: `24x24` (inline SVG)
- Icon picker grid: `size={16}`

### Custom SVG Icons (Risk Level Bars)

Bar chart style for risk levels (CRITICAL/HIGH/MEDIUM/LOW):
```tsx
// CRITICAL: filled square with "!"
<svg width="16" height="16" viewBox="0 0 16 16">
  <rect width="16" height="16" rx="3" fill="currentColor" />
  <text x="8" y="12" textAnchor="middle" fontSize="11" fontWeight="bold" fill="var(--background)">!</text>
</svg>

// HIGH/MEDIUM/LOW: 3 bars with opacity
<svg width="16" height="16" viewBox="0 0 16 16" className="text-primary/60 dark:text-muted-foreground">
  <rect x="2" y="10" width="3" height="5" rx="0.5" fill="currentColor" opacity={activeBars >= 1 ? 1 : 0.3} />
  <rect x="6.5" y="6" width="3" height="9" rx="0.5" fill="currentColor" opacity={activeBars >= 2 ? 1 : 0.3} />
  <rect x="11" y="2" width="3" height="13" rx="0.5" fill="currentColor" opacity={activeBars >= 3 ? 1 : 0.3} />
</svg>
```

### Review Status Icons (Circle-based SVG, 15x15)

| Status | Visual | Color |
|--------|--------|-------|
| APPROVED/PUBLISHED | Filled circle + checkmark | `oklch(0.72 0.12 155)` (green) |
| REJECTED | Filled circle + X | `oklch(0.7 0.12 15)` (rose) |
| IN_REVIEW | Half-filled circle | `oklch(0.72 0.12 280)` (lavender) |
| DRAFT | Empty circle | `oklch(0.75 0.12 70)` (amber) |
| GENERATING | Dashed circle | `oklch(0.6 0.02 260)` (gray) |
| PENDING | Dashed circle (lighter) | `oklch(0.55 0.01 260)` (very light gray) |

### Source Favicons

Using Google's favicon service:
```tsx
const sourceFavicons = {
  LINEAR: "https://www.google.com/s2/favicons?domain=linear.app&sz=64",
  NOTION: "https://www.google.com/s2/favicons?domain=notion.so&sz=64",
  GITHUB: "https://www.google.com/s2/favicons?domain=github.com&sz=64",
}
```

---

## Stepper Pattern (Horizontal Dot Stepper)

Used for review workflow status:

```tsx
<div className="flex min-h-[28px] w-full items-center gap-3">
  <div className="flex flex-1 items-center">
    {steps.map((step, idx) => (
      <div key={step.key} className="flex flex-1 items-center">
        <div className="flex items-center gap-2">
          {/* Dot */}
          <div className={`size-2.5 rounded-full ${dotColor}`} />
          {/* Label */}
          <span className={`text-[12px] font-medium ${textColor}`}>
            {step.label}
          </span>
        </div>
        {/* Connector line */}
        {idx < steps.length - 1 && (
          <div className={`mx-3 h-px flex-1 ${lineColor}`} />
        )}
      </div>
    ))}
  </div>
  {/* Action buttons */}
</div>
```

Dot colors:
- Completed: `bg-[oklch(0.72_0.12_155)]` (green)
- Current: `bg-[oklch(0.72_0.12_280)]` (lavender)
- Upcoming: `bg-muted-foreground/20`

Line colors:
- Completed: `bg-[oklch(0.72_0.12_155)]/40`
- Upcoming: `bg-muted-foreground/15`

---

## Stats Row Pattern

Horizontal stats with dividers:

```tsx
<div className="flex items-center divide-x divide-border/50 py-4">
  <div className="px-6 first:pl-0">
    <div className="flex flex-col gap-0.5">
      <span className="text-lg font-semibold tabular-nums text-foreground">
        {value}
      </span>
      <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
    </div>
  </div>
  {/* More stat items... */}
</div>
```

Warning variant: uses `text-destructive` for the value when count > 0.

---

## Markdown/Prose Rendering

Standard prose classes for rendered markdown content:

```tsx
const proseClasses =
  "prose prose-sm max-w-none text-[13px] leading-relaxed text-foreground/90 prose-neutral dark:prose-invert prose-headings:text-sm prose-headings:font-medium prose-p:my-2 prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-[12px] prose-pre:rounded-md prose-pre:bg-muted prose-pre:text-[12px] prose-ol:my-2 prose-ul:my-2 prose-li:my-0.5"
```

For project summaries (slightly larger):
```tsx
className="prose prose-sm max-w-none overflow-hidden text-[14px] leading-relaxed text-foreground/90 dark:prose-invert [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:font-[family-name:var(--font-heading)] [&_h2]:text-[16px] [&_h2]:font-medium [&_h2]:normal-case [&_h2]:tracking-normal [&_h2]:text-foreground [&_h2:first-child]:mt-0 [&_li]:my-1 [&_p]:my-1.5 [&_ul]:my-2 [&_ul]:pl-5"
```

---

## Icon Picker Popover Pattern

Used for project customization:

```tsx
<Popover>
  <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
    {children}
  </PopoverTrigger>
  <PopoverContent className="w-[320px] bg-[#2C2D30] border-[#3A3B3F] p-0" align="start">
    {/* Color row */}
    <div className="flex items-center justify-between px-3 pt-3 pb-1">
      {colors.map((color) => (
        <button
          className={`size-[22px] rounded-full shrink-0 transition-[box-shadow] duration-100 ring-offset-1 ring-offset-[#2C2D30] ${
            selected ? "ring-2 ring-white/40" : "hover:ring-2 hover:ring-white/25"
          }`}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>

    {/* Divider */}
    <div className="mx-3 border-t border-[#3A3B3F]" />

    {/* Icon grid */}
    <div className="grid grid-cols-10 gap-0.5 p-2 pt-1">
      {icons.map((icon) => (
        <button className={`flex size-7 items-center justify-center rounded transition-colors hover:bg-white/10 ${
          isActive ? "bg-white/15" : ""
        }`}>
          <HugeiconsIcon icon={icon} size={16} color={selectedColor} />
        </button>
      ))}
    </div>
  </PopoverContent>
</Popover>
```

---

## Select (Dropdown) Pattern

Used for status changes:

```tsx
<Select value={value} onValueChange={handler} disabled={isUpdating}>
  <SelectTrigger size="sm" className="h-7 w-fit min-w-[100px] text-[11px]">
    {currentLabel}
  </SelectTrigger>
  <SelectContent>
    {options.map((option) => (
      <SelectItem key={option} value={option}>
        {labels[option]}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

---

## Page Header Pattern (Detail Pages)

```tsx
<div className="pb-4">
  <div className="flex items-center gap-3">
    {/* Icon (clickable for picker) */}
    <IconPicker projectId={id} icon={icon} color={color}>
      <button className="flex size-8 items-center justify-center rounded-md hover:bg-accent">
        <ProjectIconDisplay icon={icon} color={color} size={20} />
      </button>
    </IconPicker>

    {/* Title */}
    <h1 className="text-sm font-semibold">{name}</h1>

    {/* Metadata */}
    <span className="text-[11px] text-muted-foreground">
      Updated {timeAgo(date)}
    </span>
  </div>
</div>
```

---

## Data Fetching Patterns

### Prefetch on Hover

Prefetch detail data when user hovers a row:
```tsx
onMouseEnter={() => queryClient.prefetchQuery(detailQueryOptions(id))}
```

Prefetch tab data when user hovers a tab trigger:
```tsx
<div onMouseEnter={() => queryClient.prefetchQuery(tabDataOptions(id))}>
  <TabsTrigger value="tab">{label}</TabsTrigger>
</div>
```

Prefetch filter results on option hover:
```tsx
onOptionHover={(value) => queryClient.prefetchInfiniteQuery(queryOptions(nextFilters))}
```

### URL-Driven State

- Filters stored in URL search params, not component state
- Sheet open state driven by `?review=<id>` param
- Tab state driven by `?tab=<value>` param
- `replace: true` for all filter/tab navigation (no history spam)

---

## Typography Scale

| Context | Size | Weight | Class |
|---------|------|--------|-------|
| Page title / Sheet title | 14px | semibold/medium | `text-sm font-semibold` |
| Row title | 13px | normal | `text-[13px]` |
| Row title (unread) | 13px | medium | `text-[13px] font-medium` |
| Metadata (counts, time) | 11px | normal | `text-[11px] text-muted-foreground` |
| External ID | 11px | normal, uppercase | `text-[11px] text-muted-foreground uppercase` |
| Section headers | 11px | medium, uppercase, tracked | `text-[11px] font-medium tracking-wide text-muted-foreground uppercase` |
| Filter badge count | 10px | normal, tabular | `text-[10px] tabular-nums` |
| Button text | 11-12px | medium | `text-[11px] font-medium` or `text-xs` |
| Prose body | 13px | normal | `text-[13px] leading-relaxed` |
| Stat value | 18px (lg) | semibold, tabular | `text-lg font-semibold tabular-nums` |
| Stat label | 11px | normal, uppercase, tracked | `text-[11px] tracking-wide text-muted-foreground uppercase` |

---

## Spacing Conventions

| Context | Value |
|---------|-------|
| Page padding | `p-6` (24px) |
| Toolbar bottom gap | `pb-4` (16px) |
| Toolbar item gap | `gap-3` (12px) |
| Tab content top padding | `pt-6` (24px) |
| Section gap (vertical) | `gap-6` (24px) |
| Inner element gap | `gap-2` or `gap-2.5` |
| Sheet body padding | `p-6` |
| Row horizontal padding | `px-4` |
| Stat horizontal padding | `px-6 first:pl-0` |

---

## Responsive Patterns

- Notification title column: `w-56 lg:w-72` (wider on large screens)
- Project overview grid: `grid-cols-1 lg:grid-cols-[45%_15%]`
- Sheet width: `w-[40vw]` with `sm:max-w-none`

---

## File Organization

```
apps/web/src/
+-- routes/          # Page components (one per route)
+-- components/
|   +-- ui/          # shadcn/Base UI primitives
|   +-- reviews/     # Review-specific components
|   |   +-- review-card.tsx
|   |   +-- review-search.tsx
|   |   +-- review-filters.tsx
|   |   +-- review-status-icon.tsx
|   |   +-- project-badge.tsx
|   |   +-- review-sheet/
|   |       +-- review-sheet.tsx
|   |       +-- review-summary-view.tsx
|   |       +-- review-stepper.tsx
|   |       +-- finding-detail-view.tsx
|   |       +-- finding-list-item.tsx
|   |       +-- finding-icons.tsx
|   |       +-- constants.ts
|   +-- projects/
|   |   +-- project-row.tsx
|   |   +-- project-search.tsx
|   |   +-- project-filters.tsx
|   |   +-- icon-picker.tsx
|   |   +-- projects-empty-state.tsx
|   |   +-- detail/
|   |       +-- project-header.tsx
|   |       +-- overview-tab.tsx
|   |       +-- reviews-tab.tsx
|   |       +-- sources-tab.tsx
|   |       +-- activity-tab.tsx
|   |       +-- stats-row.tsx
|   |       +-- summary-card.tsx
|   |       +-- sources-list.tsx
|   +-- notifications/
|       +-- notifications-toolbar.tsx
|       +-- notifications-list.tsx
|       +-- notification-row.tsx
+-- queries/         # TanStack Query options + hooks
+-- mutations/       # TanStack Query mutations
+-- stores/          # Zustand/local state
+-- hooks/           # Shared hooks (e.g., use-infinite-scroll)
```

---

## Key Conventions Summary

1. **Consistent row height**: All list items are `h-12` (48px)
2. **Consistent hover**: `hover:bg-accent dark:hover:bg-[#25262A]`
3. **All icons get tooltips**: Never show a standalone icon without tooltip context
4. **Prefetch everything on hover**: Rows, tabs, filter options
5. **URL-driven state**: Filters, active panels, tabs all in URL search params
6. **Debounced search**: 300ms debounce on text inputs
7. **Virtualize long lists**: Use `@tanstack/react-virtual` for any list that could grow
8. **Section separators**: Use comments like `// --- Page ---`, `// --- Component ---`
9. **Three states for every view**: Loading (skeleton) -> Empty -> Data
10. **No border-radius on list containers**: `rounded-md` only on outer wrapper
11. **Inline SVGs for custom status icons**: Keep them in the component or a sibling file
12. **Use oklch() for status colors**: Consistent perceptual lightness across states
13. **Tabular-nums on numbers**: Always use `tabular-nums` for counts and stats
14. **File comment headers**: Use `// --- Section Name ---` with box-drawing characters
