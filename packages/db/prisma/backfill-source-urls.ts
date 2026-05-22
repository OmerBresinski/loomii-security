/**
 * Backfill Script: Populate sourceUrl for existing ProjectSource records
 *
 * This script iterates through all ProjectSource records that have a null sourceUrl
 * and populates them by:
 * 1. For Notion sources: extracting the URL from Event.payload.url
 * 2. For Linear sources: extracting from Event.payload.url or constructing from sourceId
 *
 * Usage: bun prisma/backfill-source-urls.ts
 *
 * The script is idempotent and safe to re-run - it only updates records with null sourceUrl.
 */
import path from "path";
import fs from "fs";

// Load .env from monorepo root if DATABASE_URL not already set
if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(__dirname, "..", "..", "..", ".env");
  if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, "utf-8");
    for (const line of text.split("\n")) {
      if (line.startsWith("#") || !line.trim() || !line.includes("=")) continue;
      const eqIdx = line.indexOf("=");
      const key = line.slice(0, eqIdx).trim();
      const value = line.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

import { db } from "../src";

/** Linear workspace slug - used to construct URLs when not available in payload */
const LINEAR_WORKSPACE_SLUG = "loomii";

interface EventPayload {
  url?: string;
  pageId?: string;
  id?: string;
}

async function main() {
  console.log("Starting sourceUrl backfill...");

  // Find all ProjectSource records without a sourceUrl
  const sourcesToBackfill = await db.projectSource.findMany({
    where: {
      sourceUrl: null,
    },
    select: {
      id: true,
      sourceType: true,
      sourceId: true,
      project: {
        select: {
          tenantId: true,
        },
      },
    },
  });

  console.log(`Found ${sourcesToBackfill.length} ProjectSource records to backfill`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const source of sourcesToBackfill) {
    try {
      const sourceUrl = await resolveSourceUrl(
        source.project.tenantId,
        source.sourceType,
        source.sourceId
      );

      if (sourceUrl) {
        await db.projectSource.update({
          where: { id: source.id },
          data: { sourceUrl },
        });
        updated++;
        console.log(`  [OK] ${source.sourceType} ${source.sourceId} -> ${sourceUrl}`);
      } else {
        skipped++;
        console.log(`  [SKIP] ${source.sourceType} ${source.sourceId} - could not resolve URL`);
      }
    } catch (err) {
      errors++;
      console.error(`  [ERROR] ${source.sourceType} ${source.sourceId}:`, err);
    }
  }

  console.log("\nBackfill complete:");
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);
}

/**
 * Resolve the source URL from Event payload or construct it.
 */
async function resolveSourceUrl(
  tenantId: string,
  sourceType: string,
  sourceId: string
): Promise<string | null> {
  // Look up the most recent Event for this source
  const eventSource = sourceType === "NOTION_PAGE" ? "NOTION" : "LINEAR";

  const event = await db.event.findFirst({
    where: {
      tenantId,
      source: eventSource,
      externalId: sourceId,
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      payload: true,
    },
  });

  if (event?.payload) {
    const payload = event.payload as EventPayload;

    // Try to extract URL from payload
    if (payload.url) {
      return payload.url;
    }
  }

  // Fallback: construct URL based on source type
  if (sourceType === "LINEAR_ISSUE") {
    // For Linear, we can construct the URL from the issue ID
    return `https://linear.app/${LINEAR_WORKSPACE_SLUG}/issue/${sourceId}`;
  }

  if (sourceType === "NOTION_PAGE") {
    // For Notion, we can construct a URL from the page ID
    // Notion URLs use the page ID without hyphens
    const cleanId = sourceId.replace(/-/g, "");
    return `https://notion.so/${cleanId}`;
  }

  return null;
}

main()
  .then(async () => {
    await db.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error("Backfill failed:", e);
    await db.$disconnect();
    process.exit(1);
  });
