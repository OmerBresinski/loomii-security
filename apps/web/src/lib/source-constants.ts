/**
 * Source-related constants used across the application.
 * Two key schemes exist:
 * - Review-level keys: LINEAR, NOTION, GITHUB (from review.source)
 * - Source-type keys: LINEAR_ISSUE, NOTION_PAGE (from source.sourceType)
 *
 * Favicons are served locally from /public/favicons — zero external requests.
 */

// ─── Single source of truth for provider favicons ───────────────────────────

const PROVIDER_FAVICONS = {
  linear: "/favicons/linear.png",
  notion: "/favicons/notion.png",
  github: "/favicons/github.png",
} as const

// ─── Review-level keys (from review.source) ─────────────────────────────────

export const sourceFavicons: Record<string, string> = {
  LINEAR: PROVIDER_FAVICONS.linear,
  NOTION: PROVIDER_FAVICONS.notion,
  GITHUB: PROVIDER_FAVICONS.github,
}

export const sourceLabels: Record<string, string> = {
  LINEAR: "Linear",
  NOTION: "Notion",
  GITHUB: "GitHub",
}

// ─── Source-type keys (from source.sourceType) ──────────────────────────────

export const sourceTypeFavicons: Record<string, string> = {
  LINEAR_ISSUE: PROVIDER_FAVICONS.linear,
  NOTION_PAGE: PROVIDER_FAVICONS.notion,
}

export const sourceTypeLabels: Record<string, string> = {
  LINEAR_ISSUE: "Linear",
  NOTION_PAGE: "Notion",
}
