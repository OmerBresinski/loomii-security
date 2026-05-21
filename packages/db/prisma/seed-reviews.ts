/**
 * Seed script for review data.
 * Creates a full chain: Tenant → Integration → Events → ContextBundles → Reviews → Findings
 *
 * Usage: bun packages/db/prisma/seed-reviews.ts
 */
import { db } from "../src/index";

const TENANT_NAME = "Test Organization";
const WORKOS_ORG_ID = "org_01K3M4QS907CN7K366594YJPBT";

const TITLES = [
  "Authentication bypass in payment service",
  "SQL injection risk in user search endpoint",
  "Insecure direct object reference in file download API",
  "Cross-site scripting vulnerability in comment rendering",
  "Privilege escalation via role manipulation in admin panel",
  "Sensitive data exposure in API error responses",
  "Missing rate limiting on login endpoint",
  "Broken access control in tenant isolation layer",
  "Insecure deserialization in webhook handler",
  "Server-side request forgery in URL preview feature",
  "JWT token validation bypass via algorithm confusion",
  "Unvalidated redirect in OAuth callback flow",
  "Missing CSRF protection on state-changing endpoints",
  "Hardcoded API keys in client-side bundle",
  "Race condition in balance transfer endpoint",
  "Insecure file upload allows arbitrary code execution",
  "Missing encryption for PII in database columns",
  "Broken session management after password reset",
  "Path traversal in template rendering engine",
  "Timing attack on API key comparison",
  "Missing Content-Security-Policy headers",
  "Insecure default configuration in Redis deployment",
  "Reflected XSS in search query parameter",
  "CORS misconfiguration allows credential theft",
  "Mass assignment vulnerability in user profile update",
  "Denial of service via regex catastrophic backtracking",
  "Prototype pollution in request body processing",
  "Insufficient access control on admin API routes",
  "Session fixation vulnerability in SSO integration",
  "GraphQL introspection enabled in production",
  "Excessive permissions in service account IAM role",
  "Blind SSRF via PDF generation library",
  "Insecure WebSocket upgrade lacks authentication",
  "Cache poisoning via unkeyed query parameters",
  "Weak password hashing algorithm in legacy module",
];

const SUMMARIES = [
  "The endpoint lacks proper authentication checks allowing unauthenticated access to sensitive resources. An attacker could exploit this to read or modify data without valid credentials.",
  "User-supplied input is concatenated directly into database queries without parameterization, enabling extraction of arbitrary data from the database.",
  "Access control checks reference user-supplied IDs without verifying ownership, allowing any authenticated user to access other users' resources.",
  "HTML content is rendered without sanitization allowing script injection. This could lead to session hijacking or data exfiltration.",
  "Role assignments can be modified through direct API manipulation bypassing UI restrictions, allowing privilege escalation to admin level.",
  "Error responses include internal implementation details including stack traces, database schemas, and internal IP addresses useful for reconnaissance.",
  "No throttling mechanism exists to prevent brute-force credential guessing attacks. An attacker could attempt thousands of passwords per minute.",
  "Multi-tenant data isolation relies on application logic rather than database-level enforcement, creating risk of cross-tenant data leakage.",
  "Deserialized objects from untrusted sources can trigger arbitrary code execution on the server via crafted payloads.",
  "Server-side HTTP requests can be redirected to internal network addresses, exposing metadata services and internal APIs.",
  "The JWT verification accepts the 'none' algorithm, allowing attackers to forge tokens without a valid signature.",
  "OAuth redirect URI validation uses prefix matching, allowing attackers to redirect tokens to attacker-controlled subdomains.",
  "State-changing POST requests do not validate origin or include anti-forgery tokens, enabling cross-site request forgery attacks.",
  "Build artifacts contain hardcoded third-party API keys that are accessible via browser DevTools, risking unauthorized API usage.",
  "Concurrent requests can exploit check-then-act patterns in financial operations, leading to double-spend or negative balance scenarios.",
  "File upload validation only checks Content-Type header, not actual file contents. Attackers can upload executable files disguised as images.",
  "Personal identifiable information is stored in plaintext database columns without field-level encryption, violating data protection requirements.",
  "After password reset, existing sessions remain valid. An attacker with a stolen session can maintain access even after the user changes their password.",
  "Template rendering allows path traversal sequences, enabling attackers to include arbitrary files from the server filesystem.",
  "API key comparison uses standard string equality which is vulnerable to timing attacks, allowing byte-by-byte key extraction.",
];

const RISK_LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;
const BUNDLE_STATUSES = ["ASSEMBLING", "READY", "REVIEWING", "COMPLETED", "FAILED"] as const;
const REVIEW_STATUSES = ["PENDING", "GENERATING", "DRAFT", "IN_REVIEW", "APPROVED", "REJECTED", "PUBLISHED"] as const;
const FINDING_TYPES = ["THREAT", "REQUIREMENT", "MITIGATION", "OBSERVATION"] as const;
const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const STRIDE = ["SPOOFING", "TAMPERING", "REPUDIATION", "INFORMATION_DISCLOSURE", "DENIAL_OF_SERVICE", "ELEVATION_OF_PRIVILEGE"] as const;

async function main() {
  console.log("Seeding review data...\n");

  // 1. Upsert tenant
  const tenant = await db.tenant.upsert({
    where: { workosOrgId: WORKOS_ORG_ID },
    update: {},
    create: {
      name: TENANT_NAME,
      workosOrgId: WORKOS_ORG_ID,
    },
  });
  console.log(`Tenant: ${tenant.id} (${tenant.name})`);

  // 2. Upsert integration (LINEAR as source)
  const integration = await db.integration.upsert({
    where: { tenantId_provider: { tenantId: tenant.id, provider: "LINEAR" } },
    update: {},
    create: {
      tenantId: tenant.id,
      provider: "LINEAR",
      status: "ACTIVE",
      externalId: "linear_workspace_seed",
    },
  });
  console.log(`Integration: ${integration.id} (LINEAR)`);

  // Create Notion and GitHub integrations too
  const notionIntegration = await db.integration.upsert({
    where: { tenantId_provider: { tenantId: tenant.id, provider: "NOTION" } },
    update: {},
    create: {
      tenantId: tenant.id,
      provider: "NOTION",
      status: "ACTIVE",
      externalId: "notion_workspace_seed",
    },
  });
  console.log(`Integration: ${notionIntegration.id} (NOTION)`);

  // 3. Create 35 events → context bundles → reviews → findings
  const sources = ["LINEAR", "NOTION"] as const;
  const integrations = {
    LINEAR: integration,
    NOTION: notionIntegration,
  };
  const externalIdPrefixes = {
    LINEAR: "LOO",
    NOTION: "page",
  };

  const baseDate = new Date();
  let createdBundles = 0;
  let createdReviews = 0;
  let createdFindings = 0;

  for (let i = 0; i < 35; i++) {
    const eventDate = new Date(baseDate.getTime() - i * 2 * 3_600_000); // 2 hours apart
    const source = sources[i % sources.length];
    const prefix = externalIdPrefixes[source];
    const externalId = `${prefix}-${String(i + 1).padStart(3, "0")}`;
    const title = TITLES[i % TITLES.length];
    const summary = SUMMARIES[i % SUMMARIES.length];
    const riskLevel = RISK_LEVELS[i % RISK_LEVELS.length];
    const bundleStatus = BUNDLE_STATUSES[i % BUNDLE_STATUSES.length];

    // Event
    const event = await db.event.upsert({
      where: {
        tenantId_source_externalId_type: {
          tenantId: tenant.id,
          source,
          externalId,
          type: "issue.created",
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        integrationId: integrations[source].id,
        source,
        externalId,
        type: "issue.created",
        status: "COMPLETED",
        payload: { title, description: summary },
        processedAt: eventDate,
        createdAt: eventDate,
      },
    });

    // Context Bundle
    const bundle = await db.contextBundle.upsert({
      where: { eventId: event.id },
      update: {
        status: bundleStatus,
        riskLevel,
        title,
        summary,
      },
      create: {
        tenantId: tenant.id,
        eventId: event.id,
        status: bundleStatus,
        riskLevel,
        title,
        summary,
        content: { source: "linear", issueKey: externalId, description: summary },
        createdAt: eventDate,
      },
    });
    createdBundles++;

    // Only create review + findings for COMPLETED or REVIEWING bundles
    if (bundleStatus === "COMPLETED" || bundleStatus === "REVIEWING") {
      const reviewStatus = bundleStatus === "COMPLETED"
        ? REVIEW_STATUSES[(i * 3) % REVIEW_STATUSES.length]
        : "IN_REVIEW";

      const review = await db.review.upsert({
        where: { contextBundleId: bundle.id },
        update: { status: reviewStatus },
        create: {
          tenantId: tenant.id,
          contextBundleId: bundle.id,
          status: reviewStatus,
          mode: i % 3 === 0 ? "MANUAL" : "AUTOMATED",
          severity: SEVERITIES[i % SEVERITIES.length],
          confidence: 0.6 + (i % 4) * 0.1,
          summary,
          modelUsed: "amazon.nova-pro-v1:0",
          createdAt: eventDate,
        },
      });
      createdReviews++;

      // Create 2-5 findings per review
      const findingCount = 2 + (i % 4);
      for (let f = 0; f < findingCount; f++) {
        await db.finding.upsert({
          where: {
            id: `finding_seed_${i}_${f}`,
          },
          update: {},
          create: {
            id: `finding_seed_${i}_${f}`,
            reviewId: review.id,
            type: FINDING_TYPES[f % FINDING_TYPES.length],
            title: `${FINDING_TYPES[f % FINDING_TYPES.length]}: ${title.split(" ").slice(0, 4).join(" ")}`,
            description: `Finding ${f + 1} for review of "${title}". ${summary.slice(0, 100)}`,
            severity: SEVERITIES[(i + f) % SEVERITIES.length],
            confidence: 0.5 + ((i + f) % 5) * 0.1,
            strideCategory: STRIDE[(i + f) % STRIDE.length],
            effortEstimate: (["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const)[(i + f) % 4],
            status: f === 0 ? "OPEN" : (["OPEN", "ACCEPTED", "RESOLVED"] as const)[f % 3],
            createdAt: eventDate,
          },
        });
        createdFindings++;
      }
    }
  }

  console.log(`\nSeeding complete:`);
  console.log(`  Context Bundles: ${createdBundles}`);
  console.log(`  Reviews: ${createdReviews}`);
  console.log(`  Findings: ${createdFindings}`);

  // Verify
  const bundleCount = await db.contextBundle.count({ where: { tenantId: tenant.id } });
  const reviewCount = await db.review.count({ where: { tenantId: tenant.id } });
  const findingCount = await db.finding.count();
  console.log(`\nVerification: ${bundleCount} bundles, ${reviewCount} reviews, ${findingCount} findings in DB`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  });
