import { describe, test, expect } from "bun:test";
import { maskTokens } from "./logging";

describe("maskTokens", () => {
  test("masks Bearer tokens", () => {
    const input = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N";
    const result = maskTokens(input);
    expect(result).toContain("Bearer tok_****");
    expect(result).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
  });

  test("masks tokens in JSON strings", () => {
    const input = JSON.stringify({
      access_token: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      refresh_token: "ghr_yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy",
      user: "john",
    });
    const result = maskTokens(input);
    expect(result).not.toContain("ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
    expect(result).not.toContain("ghr_yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy");
    expect(result).toContain("tok_****");
    expect(result).toContain("john");
  });

  test("leaves non-token strings unchanged", () => {
    const input = "Hello, this is a normal log message with no sensitive data.";
    const result = maskTokens(input);
    expect(result).toBe(input);
  });

  test("leaves short strings unchanged", () => {
    const input = "token=abc";
    const result = maskTokens(input);
    // "abc" is too short (< 20 chars) to match the inline pattern
    expect(result).toBe(input);
  });

  test("masks multiple tokens in the same string", () => {
    const input = `Bearer eyJ123456789012345678901234567890 and "access_token": "sometoken1234567890abcdef"`;
    const result = maskTokens(input);
    expect(result).not.toContain("eyJ123456789012345678901234567890");
    expect(result).not.toContain("sometoken1234567890abcdef");
  });

  test("masks api_key field in JSON", () => {
    const input = `{"api_key": "xk_test_abcdefghijklmnopqrstuvwxyz123456"}`;
    const result = maskTokens(input);
    expect(result).not.toContain("xk_test_abcdefghijklmnopqrstuvwxyz123456");
    expect(result).toContain("tok_****");
  });

  test("preserves surrounding context", () => {
    const input = `[INFO] Request from user_123: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.longtoken123456 - completed in 45ms`;
    const result = maskTokens(input);
    expect(result).toContain("[INFO]");
    expect(result).toContain("user_123");
    expect(result).toContain("completed in 45ms");
    expect(result).toContain("Bearer tok_****");
  });
});
