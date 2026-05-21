import { Hono } from "hono";
import type { AppEnv } from "../../lib/types";

export const reviewRoutes = new Hono<AppEnv>();

// ─── Types ──────────────────────────────────────────────────────────────────

type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
type BundleStatus = "ASSEMBLING" | "READY" | "REVIEWING" | "COMPLETED" | "FAILED";

interface Review {
  id: string;
  eventId: string;
  status: BundleStatus;
  riskLevel: RiskLevel | null;
  title: string | null;
  summary: string | null;
  findingCount: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Deterministic Seed Data ────────────────────────────────────────────────

const TITLES: string[] = [
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
  "Weak password hashing algorithm in legacy auth module",
  "JWT token validation bypass via algorithm confusion",
  "Unvalidated redirect in OAuth callback flow",
  "Information disclosure via verbose logging",
  "Missing CSRF protection on state-changing endpoints",
  "Hardcoded API keys in client-side bundle",
  "Insufficient input validation in GraphQL resolvers",
  "Race condition in balance transfer endpoint",
  "Insecure file upload allows arbitrary code execution",
  "Missing encryption for PII in database columns",
  "Broken session management after password reset",
  "DNS rebinding attack surface in internal service mesh",
  "Memory leak in WebSocket connection handler",
  "Cleartext transmission of credentials in health check",
  "XML external entity injection in document parser",
  "Improper certificate validation in mTLS setup",
  "Path traversal in template rendering engine",
  "Integer overflow in pagination offset parameter",
  "Timing attack on API key comparison",
  "Unrestricted resource consumption in file processing",
  "Missing Content-Security-Policy headers",
  "Subdomain takeover risk on unused DNS records",
  "Insecure default configuration in Redis deployment",
  "Credential stuffing vulnerability due to missing lockout",
  "Reflected XSS in search query parameter",
  "Stored XSS via SVG upload in avatar feature",
  "CORS misconfiguration allows credential theft",
  "Open redirect in email verification link",
  "Mass assignment vulnerability in user profile update",
  "Denial of service via regex catastrophic backtracking",
  "Insecure random number generation for session tokens",
  "Missing Referrer-Policy header leaks sensitive URLs",
  "Clickjacking vulnerability on settings page",
  "Host header injection in password reset emails",
  "Insufficient logging of security-relevant events",
  "Unpatched dependency with known CVE in image processing",
  "API versioning gap exposes deprecated insecure endpoints",
  "Weak TLS configuration allows downgrade attacks",
  "Missing input length validation causes buffer overrun",
  "Insecure inter-service communication over plaintext HTTP",
  "Broken object-level authorization in REST API",
  "Excessive data exposure in list endpoints",
  "Lack of resource isolation between tenant workloads",
  "Improper error handling reveals stack traces",
  "Missing security headers on static asset responses",
  "Unsafe use of eval() in configuration parser",
  "Prototype pollution in request body processing",
  "Supply chain risk from unverified npm packages",
  "Insufficient access control on admin API routes",
  "Cryptographic key stored in environment without rotation",
  "Session fixation vulnerability in SSO integration",
  "Unrestricted cross-origin resource sharing on API",
  "Missing audit trail for data deletion operations",
  "Insecure temporary file creation in export feature",
  "Bypass of WAF rules via HTTP request smuggling",
  "Unprotected sensitive business logic in client code",
  "Account enumeration via differential response timing",
  "Improper null byte handling in file path validation",
  "Missing mutual TLS between microservices",
  "Insecure WebSocket upgrade lacks authentication",
  "Cache poisoning via unkeyed query parameters",
  "GraphQL introspection enabled in production",
  "Excessive permissions in service account IAM role",
  "Missing subresource integrity for CDN assets",
  "Insecure password recovery mechanism",
  "Blind SSRF via PDF generation library",
  "Type confusion in polymorphic deserialization",
  "Insufficient anti-automation on registration flow",
  "Data leak via browser autocomplete on sensitive forms",
  "Missing secure flag on authentication cookies",
];

const SUMMARIES: string[] = [
  "The endpoint lacks proper authentication checks allowing unauthenticated access to sensitive resources.",
  "User-supplied input is concatenated directly into database queries without parameterization.",
  "Access control checks reference user-supplied IDs without verifying ownership or permissions.",
  "HTML content is rendered without sanitization allowing script injection in the browser.",
  "Role assignments can be modified through direct API manipulation bypassing UI restrictions.",
  "Error responses include internal implementation details useful for attacker reconnaissance.",
  "No throttling mechanism exists to prevent brute-force credential guessing attacks.",
  "Multi-tenant data isolation relies on application logic rather than database-level enforcement.",
  "Deserialized objects from untrusted sources can trigger arbitrary code execution.",
  "Server-side HTTP requests can be redirected to internal network addresses.",
  "Legacy bcrypt cost factor is set to 4, significantly below the recommended minimum of 12.",
  "Token verification accepts 'none' algorithm allowing signature bypass.",
  "OAuth redirect URI validation uses prefix matching allowing subdomain-based attacks.",
  "Application logs contain full request bodies including authentication credentials.",
  "State-changing POST requests do not validate origin or include anti-forgery tokens.",
  "Build artifacts contain hardcoded third-party API keys accessible via browser DevTools.",
  "GraphQL mutation inputs accept arbitrary nested objects without depth or field validation.",
  "Concurrent requests can exploit check-then-act patterns in financial operations.",
  "File upload validation only checks Content-Type header, not actual file contents.",
  "Personal identifiable information stored in plaintext columns without field-level encryption.",
];

const RISK_LEVELS: RiskLevel[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
const STATUSES: BundleStatus[] = ["ASSEMBLING", "READY", "REVIEWING", "COMPLETED", "FAILED"];

function generateReviews(): Review[] {
  const reviews: Review[] = [];
  const baseDate = new Date("2026-05-20T12:00:00Z");

  for (let i = 0; i < 80; i++) {
    const createdAt = new Date(baseDate.getTime() - i * 3_600_000); // 1 hour apart
    const updatedAt = new Date(createdAt.getTime() + 600_000); // 10 min after creation

    reviews.push({
      id: `review_${String(i + 1).padStart(3, "0")}`,
      eventId: `event_${String(i + 1).padStart(3, "0")}`,
      status: STATUSES[i % STATUSES.length],
      riskLevel: i % 7 === 0 ? null : RISK_LEVELS[i % RISK_LEVELS.length],
      title: TITLES[i % TITLES.length],
      summary: SUMMARIES[i % SUMMARIES.length],
      findingCount: ((i * 7 + 3) % 12) + 1,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });
  }

  return reviews;
}

const SEEDED_REVIEWS = generateReviews();

// ─── Route Handler ──────────────────────────────────────────────────────────

/**
 * GET /api/v1/reviews
 *
 * Query params:
 *   - status: comma-separated BundleStatus values
 *   - riskLevel: comma-separated RiskLevel values
 *   - search: keyword match on title/summary (case-insensitive)
 *   - limit: number 1-100 (default 20)
 *   - cursor: opaque pagination cursor (base64-encoded index)
 */
reviewRoutes.get("/", (c) => {
  const statusParam = c.req.query("status");
  const riskParam = c.req.query("riskLevel");
  const search = c.req.query("search")?.toLowerCase();
  const limitParam = c.req.query("limit");
  const cursor = c.req.query("cursor");

  const limit = Math.min(Math.max(parseInt(limitParam || "20", 10) || 20, 1), 100);

  // Parse comma-separated filter values
  const statusFilter = statusParam
    ? statusParam.split(",").filter((s) => STATUSES.includes(s as BundleStatus)) as BundleStatus[]
    : null;
  const riskFilter = riskParam
    ? riskParam.split(",").filter((r) => RISK_LEVELS.includes(r as RiskLevel)) as RiskLevel[]
    : null;

  // Apply filters
  let filtered = SEEDED_REVIEWS;

  if (statusFilter && statusFilter.length > 0) {
    filtered = filtered.filter((r) => statusFilter.includes(r.status));
  }

  if (riskFilter && riskFilter.length > 0) {
    filtered = filtered.filter((r) => r.riskLevel !== null && riskFilter.includes(r.riskLevel));
  }

  if (search) {
    filtered = filtered.filter(
      (r) =>
        (r.title && r.title.toLowerCase().includes(search)) ||
        (r.summary && r.summary.toLowerCase().includes(search))
    );
  }

  // Cursor-based pagination (cursor = base64-encoded start index)
  let startIndex = 0;
  if (cursor) {
    try {
      startIndex = parseInt(Buffer.from(cursor, "base64").toString("utf-8"), 10);
      if (isNaN(startIndex) || startIndex < 0) startIndex = 0;
    } catch {
      startIndex = 0;
    }
  }

  const page = filtered.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < filtered.length;
  const nextCursor = hasMore
    ? Buffer.from(String(startIndex + limit)).toString("base64")
    : null;

  return c.json({
    data: page,
    nextCursor,
    hasMore,
  });
});
