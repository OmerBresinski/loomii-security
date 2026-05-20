/**
 * Database Seed Script
 *
 * Seeds the database with built-in OWASP policies.
 * Idempotent: uses upsert on unique identifier to prevent duplicates on re-run.
 *
 * Usage: bunx --bun prisma db seed
 *
 * NOTE: Embedding generation is skipped during seeding (requires Bedrock credentials).
 * Run the embedding worker after seeding to generate policy embeddings.
 */
import { PrismaClient } from "@prisma/client";
import { owaspTop10Policies } from "./policies/owasp-top-10-2021";
import { owaspLlmTop10Policies } from "./policies/owasp-llm-top-10";

const db = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const allPolicies = [...owaspTop10Policies, ...owaspLlmTop10Policies];

  console.log(`Seeding ${allPolicies.length} built-in policies...`);

  let created = 0;
  let updated = 0;

  for (const policy of allPolicies) {
    const result = await db.policy.upsert({
      where: { identifier: policy.identifier },
      update: {
        name: policy.name,
        framework: policy.framework,
        content: policy.content,
        keywords: policy.keywords,
        isBuiltIn: true,
        isEnabled: true,
      },
      create: {
        tenantId: null, // Available to all tenants
        name: policy.name,
        framework: policy.framework,
        identifier: policy.identifier,
        content: policy.content,
        keywords: policy.keywords,
        isBuiltIn: true,
        isEnabled: true,
      },
    });

    // Detect if it was a create or update by comparing timestamps
    const isNew =
      Math.abs(result.createdAt.getTime() - result.updatedAt.getTime()) < 1000;
    if (isNew) {
      created++;
    } else {
      updated++;
    }
  }

  console.log(
    `Seeding complete: ${created} created, ${updated} updated (${allPolicies.length} total)`
  );

  // Verify
  const count = await db.policy.count({ where: { isBuiltIn: true } });
  console.log(`Verification: ${count} built-in policies in database`);

  if (count !== 20) {
    console.warn(
      `WARNING: Expected 20 built-in policies but found ${count}`
    );
  }
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (e) => {
    console.error("Seed failed:", e);
    await db.$disconnect();
    process.exit(1);
  });
