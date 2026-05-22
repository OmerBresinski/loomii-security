/**
 * Seeds projects with icons/colors, sources, events, reviews, and findings.
 * Run after DB reset: bun packages/db/prisma/seed-projects.ts
 */
import { db } from "../src/index";

const WORKOS_ORG_ID = "org_01K3M4QS907CN7K366594YJPBT";

const PROJECTS = [
  {
    id: "proj_payment_service",
    name: "Payment Service Redesign",
    icon: "ShieldKeyIcon",
    color: "#A78BFA",
    summary: `## Project Scope\nThe Payment Service Redesign migrates monolithic payment processing into a dedicated microservice with PCI-DSS compliance. Handles credit card tokenization, recurring billing, and refund orchestration across Stripe and Adyen.\n\n## Architecture\n- Event-driven architecture using AWS SQS for async payment processing\n- Dedicated PostgreSQL database with field-level encryption for cardholder data\n- API gateway with rate limiting and request signing\n- Webhook handlers for provider callbacks with idempotency keys\n\n## Security Patterns\n- PCI-DSS Level 1 compliant token vault (no raw card data stored)\n- mTLS between services, OAuth2 client credentials for API access\n- Envelope encryption with AWS KMS for sensitive fields\n- Audit logging of all payment state transitions\n\n## Known Risks\n- Race conditions in concurrent refund processing\n- Webhook replay attacks possible without timestamp validation\n- Legacy migration path temporarily stores PAN in memory`,
  },
  {
    id: "proj_auth_overhaul",
    name: "User Authentication Overhaul",
    icon: "LockIcon",
    color: "#67E8F9",
    summary: `## Project Scope\nComplete replacement of the legacy session-based auth system with a modern identity platform. Implementing passkeys (WebAuthn), SSO via SAML/OIDC, and progressive MFA enrollment.\n\n## Architecture\n- WorkOS as the identity provider with custom session management\n- JWT access tokens (15min) + opaque refresh tokens (30 days) in HttpOnly cookies\n- Session service backed by Redis with per-device tracking\n- Middleware chain: rate limit → auth → RBAC → handler\n\n## Security Patterns\n- PKCE flow for all OAuth redirects, no implicit grants\n- Refresh token rotation with reuse detection\n- Device fingerprinting for anomaly detection\n- Argon2id for password hashing\n\n## Known Risks\n- Session fixation during legacy-to-new migration window\n- Refresh token in localStorage on mobile web\n- Rate limiting on /auth endpoints insufficient for distributed attacks`,
  },
  {
    id: "proj_notion_v2",
    name: "Notion Integration v2",
    icon: "GlobeIcon",
    color: "#6EE7B7",
    summary: `## Project Scope\nSecond-generation Notion integration with real-time sync via webhooks, bi-directional page linking, and rich content extraction for security analysis.\n\n## Architecture\n- Notion webhook receiver with HMAC-SHA256 signature verification\n- Content extraction pipeline: Notion blocks → markdown → embeddings\n- Background sync worker with exponential backoff and circuit breaker\n- Local page cache with invalidation on webhook events\n\n## Security Patterns\n- OAuth 2.0 with PKCE for workspace authorization\n- Encrypted token storage (AES-256-GCM) with per-tenant keys\n- Webhook signature verification before processing\n- Content sanitization before storage\n\n## Known Risks\n- Notion API rate limits (3 req/sec) may cause sync backlogs\n- Webhook delivery not guaranteed; need reconciliation job\n- Large pages may exceed embedding token limits`,
  },
  {
    id: "proj_admin_dashboard",
    name: "Internal Admin Dashboard",
    icon: "Settings01Icon",
    color: "#FCD34D",
    summary: `## Project Scope\nInternal-only dashboard for the security operations team to manage tenants, review platform health, investigate incidents, and override automated decisions.\n\n## Architecture\n- Separate Next.js app on internal VPN-only subnet\n- Direct database read replicas for analytics queries\n- Admin API routes with Google Workspace SSO + hardware key MFA\n- Audit log for every admin action with before/after snapshots\n\n## Security Patterns\n- Zero-trust networking: VPN + device certificate + SSO required\n- Immutable audit trail (append-only table) for all admin actions\n- No direct database writes; all mutations via validated admin API\n- Separate AWS IAM role with time-boxed credentials\n\n## Known Risks\n- Read replica lag may show stale data during incidents\n- Admin API lacks request signing (relies on network isolation)\n- Shared admin credentials exist for legacy monitoring tools`,
  },
  {
    id: "proj_rate_limiting",
    name: "API Rate Limiting & Abuse Prevention",
    icon: "Shield01Icon",
    color: "#FDBA74",
    summary: `## Project Scope\nComprehensive rate limiting and abuse prevention across all public API endpoints. Covers sliding window limits, adaptive throttling, and automated blocking of abusive patterns.\n\n## Architecture\n- Redis-backed sliding window counters with Lua scripts for atomicity\n- Multi-tier limits: per-IP, per-API-key, per-tenant, per-endpoint\n- Adaptive throttling that tightens on auth endpoints during attacks\n- Real-time metrics pipeline feeding anomaly detection\n\n## Security Patterns\n- Fail-closed: if Redis is down, requests are rejected\n- Graduated response: warn → throttle → block → ban\n- API key fingerprinting to detect credential sharing\n- Honeypot endpoints to identify automated scanners\n\n## Known Risks\n- Legitimate CI/CD burst traffic may trigger false positives\n- Corporate NAT/proxy IPs complicate per-IP limiting\n- Redis failover window (~5s) creates brief enforcement gap`,
  },
];

const REVIEWS_DATA = [
  { projectId: "proj_payment_service", externalId: "PAY-101", source: "LINEAR" as const, title: "Race condition in concurrent refund processing", riskLevel: "CRITICAL" as const, severity: "CRITICAL" as const, confidence: 0.95, findingCount: 4 },
  { projectId: "proj_payment_service", externalId: "PAY-102", source: "LINEAR" as const, title: "Webhook replay attack on payment callbacks", riskLevel: "HIGH" as const, severity: "HIGH" as const, confidence: 0.88, findingCount: 3 },
  { projectId: "proj_payment_service", externalId: "PAY-103", source: "NOTION" as const, title: "PCI-DSS compliance gap in card data handling", riskLevel: "HIGH" as const, severity: "HIGH" as const, confidence: 0.82, findingCount: 2 },
  { projectId: "proj_auth_overhaul", externalId: "AUTH-201", source: "LINEAR" as const, title: "JWT algorithm confusion allows token forgery", riskLevel: "CRITICAL" as const, severity: "CRITICAL" as const, confidence: 0.97, findingCount: 3 },
  { projectId: "proj_auth_overhaul", externalId: "AUTH-202", source: "LINEAR" as const, title: "Session fixation during legacy auth migration", riskLevel: "HIGH" as const, severity: "HIGH" as const, confidence: 0.84, findingCount: 3 },
  { projectId: "proj_auth_overhaul", externalId: "AUTH-203", source: "LINEAR" as const, title: "Refresh token exposure in mobile localStorage", riskLevel: "MEDIUM" as const, severity: "MEDIUM" as const, confidence: 0.75, findingCount: 2 },
  { projectId: "proj_notion_v2", externalId: "INT-301", source: "LINEAR" as const, title: "SSRF via Notion page URL extraction", riskLevel: "HIGH" as const, severity: "HIGH" as const, confidence: 0.86, findingCount: 2 },
  { projectId: "proj_notion_v2", externalId: "INT-302", source: "LINEAR" as const, title: "Missing webhook signature verification on retry path", riskLevel: "MEDIUM" as const, severity: "MEDIUM" as const, confidence: 0.78, findingCount: 2 },
  { projectId: "proj_admin_dashboard", externalId: "ADM-401", source: "LINEAR" as const, title: "Admin API lacks request signing", riskLevel: "MEDIUM" as const, severity: "MEDIUM" as const, confidence: 0.81, findingCount: 2 },
  { projectId: "proj_admin_dashboard", externalId: "ADM-402", source: "LINEAR" as const, title: "Shared credentials for legacy monitoring access", riskLevel: "LOW" as const, severity: "LOW" as const, confidence: 0.90, findingCount: 1 },
  { projectId: "proj_rate_limiting", externalId: "RL-501", source: "LINEAR" as const, title: "Rate limiter fail-open when Redis is unavailable", riskLevel: "HIGH" as const, severity: "HIGH" as const, confidence: 0.92, findingCount: 3 },
  { projectId: "proj_rate_limiting", externalId: "RL-502", source: "LINEAR" as const, title: "IP-based limits ineffective behind corporate proxies", riskLevel: "LOW" as const, severity: "LOW" as const, confidence: 0.68, findingCount: 1 },
  { projectId: "proj_rate_limiting", externalId: "RL-503", source: "LINEAR" as const, title: "Missing rate limits on GraphQL endpoint", riskLevel: "MEDIUM" as const, severity: "MEDIUM" as const, confidence: 0.83, findingCount: 2 },
  { projectId: null, externalId: "MISC-601", source: "LINEAR" as const, title: "Content-Security-Policy headers missing on all responses", riskLevel: "MEDIUM" as const, severity: "MEDIUM" as const, confidence: 0.85, findingCount: 1 },
  { projectId: null, externalId: "MISC-602", source: "NOTION" as const, title: "Third-party dependency with known CVE", riskLevel: "INFO" as const, severity: "LOW" as const, confidence: 0.60, findingCount: 1 },
];

const SOURCES_DATA = [
  { projectId: "proj_payment_service", type: "LINEAR_ISSUE" as const, id: "PAY-101", method: "MANUAL" as const },
  { projectId: "proj_payment_service", type: "LINEAR_ISSUE" as const, id: "PAY-102", method: "MANUAL" as const },
  { projectId: "proj_payment_service", type: "LINEAR_ISSUE" as const, id: "PAY-103", method: "AUTO" as const },
  { projectId: "proj_payment_service", type: "NOTION_PAGE" as const, id: "notion-pay-arch-001", method: "MANUAL" as const },
  { projectId: "proj_payment_service", type: "NOTION_PAGE" as const, id: "notion-pay-pci-002", method: "MANUAL" as const },
  { projectId: "proj_auth_overhaul", type: "LINEAR_ISSUE" as const, id: "AUTH-201", method: "MANUAL" as const },
  { projectId: "proj_auth_overhaul", type: "LINEAR_ISSUE" as const, id: "AUTH-202", method: "MANUAL" as const },
  { projectId: "proj_auth_overhaul", type: "LINEAR_ISSUE" as const, id: "AUTH-203", method: "MANUAL" as const },
  { projectId: "proj_auth_overhaul", type: "NOTION_PAGE" as const, id: "notion-auth-rfc-001", method: "MANUAL" as const },
  { projectId: "proj_auth_overhaul", type: "NOTION_PAGE" as const, id: "notion-auth-flows-002", method: "AUTO" as const },
  { projectId: "proj_notion_v2", type: "LINEAR_ISSUE" as const, id: "INT-301", method: "MANUAL" as const },
  { projectId: "proj_notion_v2", type: "LINEAR_ISSUE" as const, id: "INT-302", method: "MANUAL" as const },
  { projectId: "proj_notion_v2", type: "NOTION_PAGE" as const, id: "notion-int-design-001", method: "MANUAL" as const },
  { projectId: "proj_admin_dashboard", type: "LINEAR_ISSUE" as const, id: "ADM-401", method: "MANUAL" as const },
  { projectId: "proj_admin_dashboard", type: "LINEAR_ISSUE" as const, id: "ADM-402", method: "MANUAL" as const },
  { projectId: "proj_admin_dashboard", type: "NOTION_PAGE" as const, id: "notion-adm-spec-001", method: "MANUAL" as const },
  { projectId: "proj_rate_limiting", type: "LINEAR_ISSUE" as const, id: "RL-501", method: "MANUAL" as const },
  { projectId: "proj_rate_limiting", type: "LINEAR_ISSUE" as const, id: "RL-502", method: "MANUAL" as const },
  { projectId: "proj_rate_limiting", type: "LINEAR_ISSUE" as const, id: "RL-503", method: "AUTO" as const },
  { projectId: "proj_rate_limiting", type: "NOTION_PAGE" as const, id: "notion-rl-design-001", method: "MANUAL" as const },
];

const FINDING_TYPES = ["THREAT", "REQUIREMENT", "MITIGATION", "OBSERVATION"] as const;
const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const STRIDE = ["SPOOFING", "TAMPERING", "REPUDIATION", "INFORMATION_DISCLOSURE", "DENIAL_OF_SERVICE", "ELEVATION_OF_PRIVILEGE"] as const;

async function main() {
  console.log("=== Seeding Projects ===\n");

  // 1. Upsert tenant
  const tenant = await db.tenant.upsert({
    where: { workosOrgId: WORKOS_ORG_ID },
    update: {},
    create: { name: "Loomii Security", workosOrgId: WORKOS_ORG_ID },
  });
  console.log(`Tenant: ${tenant.id}`);

  // 2. Create user
  const user = await db.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "alex@loomii.dev" } },
    update: {},
    create: {
      tenantId: tenant.id,
      workosUserId: "user_seed_admin_01",
      email: "alex@loomii.dev",
      firstName: "Alex",
      lastName: "Chen",
      role: "SECURITY_LEAD",
    },
  });

  // 3. Create integrations
  const linearInt = await db.integration.upsert({
    where: { tenantId_provider: { tenantId: tenant.id, provider: "LINEAR" } },
    update: {},
    create: { tenantId: tenant.id, provider: "LINEAR", status: "ACTIVE", externalId: "linear_ws" },
  });
  const notionInt = await db.integration.upsert({
    where: { tenantId_provider: { tenantId: tenant.id, provider: "NOTION" } },
    update: {},
    create: { tenantId: tenant.id, provider: "NOTION", status: "ACTIVE", externalId: "notion_ws" },
  });
  const intMap = { LINEAR: linearInt, NOTION: notionInt };

  // 4. Create projects with icons
  for (const p of PROJECTS) {
    await db.project.upsert({
      where: { id: p.id },
      update: { name: p.name, icon: p.icon, color: p.color, summary: p.summary, summaryUpdatedAt: new Date() },
      create: {
        id: p.id,
        tenantId: tenant.id,
        name: p.name,
        icon: p.icon,
        color: p.color,
        summary: p.summary,
        summaryUpdatedAt: new Date(Date.now() - Math.random() * 86_400_000),
        createdById: user.id,
      },
    });
  }
  console.log(`Projects: ${PROJECTS.length}`);

  // 5. Create sources
  const baseTime = Date.now();
  for (let i = 0; i < SOURCES_DATA.length; i++) {
    const s = SOURCES_DATA[i];
    await db.projectSource.upsert({
      where: { projectId_sourceType_sourceId: { projectId: s.projectId, sourceType: s.type, sourceId: s.id } },
      update: {},
      create: {
        projectId: s.projectId,
        sourceType: s.type,
        sourceId: s.id,
        linkedBy: s.method,
        linkedByUserId: s.method === "MANUAL" ? user.id : null,
        linkedAt: new Date(baseTime - i * 7_200_000),
      },
    });
  }
  console.log(`Sources: ${SOURCES_DATA.length}`);

  // 6. Create events + bundles + reviews + findings
  let reviewCount = 0;
  let findingCount = 0;
  for (let i = 0; i < REVIEWS_DATA.length; i++) {
    const r = REVIEWS_DATA[i];
    const eventDate = new Date(baseTime - (i + 1) * 14_400_000);

    const event = await db.event.upsert({
      where: { tenantId_source_externalId_type: { tenantId: tenant.id, source: r.source, externalId: r.externalId, type: "issue.created" } },
      update: {},
      create: {
        tenantId: tenant.id,
        integrationId: intMap[r.source].id,
        source: r.source,
        externalId: r.externalId,
        type: "issue.created",
        status: "COMPLETED",
        payload: { title: r.title },
        processedAt: eventDate,
        createdAt: eventDate,
      },
    });

    const bundle = await db.contextBundle.upsert({
      where: { eventId: event.id },
      update: { projectId: r.projectId },
      create: {
        tenantId: tenant.id,
        eventId: event.id,
        projectId: r.projectId,
        status: "COMPLETED",
        riskLevel: r.riskLevel,
        title: r.title,
        summary: r.title,
        content: { source: r.source.toLowerCase(), key: r.externalId },
        createdAt: eventDate,
      },
    });

    const review = await db.review.upsert({
      where: { contextBundleId: bundle.id },
      update: {},
      create: {
        tenantId: tenant.id,
        contextBundleId: bundle.id,
        status: "APPROVED",
        mode: "AUTOMATED",
        severity: r.severity,
        confidence: r.confidence,
        summary: r.title,
        modelUsed: "amazon.nova-pro-v1:0",
        createdAt: eventDate,
      },
    });
    reviewCount++;

    // Create findings
    for (let f = 0; f < r.findingCount; f++) {
      await db.finding.upsert({
        where: { id: `finding_${r.externalId}_${f}` },
        update: {},
        create: {
          id: `finding_${r.externalId}_${f}`,
          reviewId: review.id,
          type: FINDING_TYPES[f % FINDING_TYPES.length],
          title: `Finding ${f + 1}: ${r.title.split(" ").slice(0, 5).join(" ")}`,
          description: `${FINDING_TYPES[f % FINDING_TYPES.length]} finding for ${r.title}`,
          severity: SEVERITIES[Math.min(f, SEVERITIES.length - 1)],
          confidence: r.confidence - f * 0.05,
          strideCategory: STRIDE[(i + f) % STRIDE.length],
          effortEstimate: (["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const)[f % 4],
          status: f === 0 ? "OPEN" : "RESOLVED",
          createdAt: eventDate,
        },
      });
      findingCount++;
    }
  }

  console.log(`Reviews: ${reviewCount}`);
  console.log(`Findings: ${findingCount}`);
  console.log("\nDone.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("Seed failed:", e); process.exit(1); });
