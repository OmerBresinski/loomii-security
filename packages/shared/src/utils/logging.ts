/**
 * Token masking utilities for log sanitization.
 * Ensures sensitive tokens are never exposed in logs.
 */

/**
 * Patterns that match common token/secret formats:
 * - Bearer tokens in Authorization headers
 * - Generic long hex/base64 strings that look like tokens
 * - OAuth access/refresh tokens
 * - API keys (various formats)
 */
const TOKEN_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // Bearer tokens: "Bearer eyJ..." or "Bearer ghp_..."
  {
    pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g,
    replacement: "Bearer tok_****",
  },
  // Generic token fields in JSON: "access_token": "value" or "token": "value"
  {
    pattern:
      /("(?:access_token|refresh_token|token|api_key|secret|authorization)"\s*:\s*")([^"]+)(")/gi,
    replacement: '$1tok_****$3',
  },
  // Inline token values that look like secrets (20+ chars of alphanumeric + special)
  {
    pattern:
      /(?<=(?:token|key|secret|password|authorization)[=:]\s*["']?)[A-Za-z0-9\-._~+/]{20,}=*/g,
    replacement: "tok_****",
  },
];

/**
 * Masks token-like strings in the input text.
 * Used for sanitizing logs to prevent credential leaks.
 *
 * @param text - The string potentially containing sensitive tokens
 * @returns The string with tokens replaced by `tok_****`
 */
export function maskTokens(text: string): string {
  let result = text;
  for (const { pattern, replacement } of TOKEN_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    result = result.replace(pattern, replacement);
  }
  return result;
}
