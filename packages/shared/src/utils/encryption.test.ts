import { describe, test, expect, beforeAll } from "bun:test";
import { encrypt, decrypt } from "./encryption";

// Set test encryption key (32 bytes = 64 hex chars)
beforeAll(() => {
  process.env.ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
});

describe("encryption", () => {
  test("encrypts and decrypts correctly", () => {
    const plaintext = "my-secret-oauth-token-12345";
    const ciphertext = encrypt(plaintext);
    const decrypted = decrypt(ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  test("produces different ciphertext for same input (random IV)", () => {
    const plaintext = "same-input-different-output";
    const ciphertext1 = encrypt(plaintext);
    const ciphertext2 = encrypt(plaintext);
    expect(ciphertext1).not.toBe(ciphertext2);

    // Both should decrypt to the same value
    expect(decrypt(ciphertext1)).toBe(plaintext);
    expect(decrypt(ciphertext2)).toBe(plaintext);
  });

  test("handles empty string", () => {
    const plaintext = "";
    const ciphertext = encrypt(plaintext);
    const decrypted = decrypt(ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  test("handles unicode content", () => {
    const plaintext = "token with unicode: \u{1F512}\u{1F511} and accents: cafe\u0301";
    const ciphertext = encrypt(plaintext);
    const decrypted = decrypt(ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  test("handles long tokens", () => {
    const plaintext = "a".repeat(10000);
    const ciphertext = encrypt(plaintext);
    const decrypted = decrypt(ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  test("ciphertext format is iv:tag:data (base64)", () => {
    const ciphertext = encrypt("test");
    const parts = ciphertext.split(":");
    expect(parts.length).toBe(3);

    // Each part should be valid base64
    for (const part of parts) {
      expect(() => Buffer.from(part, "base64")).not.toThrow();
      expect(part.length).toBeGreaterThan(0);
    }
  });

  test("fails gracefully with invalid ciphertext", () => {
    expect(() => decrypt("not-valid-ciphertext")).toThrow();
  });

  test("fails with tampered ciphertext", () => {
    const ciphertext = encrypt("sensitive-data");
    const parts = ciphertext.split(":");
    // Tamper with the encrypted data
    const tampered = `${parts[0]}:${parts[1]}:${Buffer.from("tampered").toString("base64")}`;
    expect(() => decrypt(tampered)).toThrow();
  });

  test("fails with tampered auth tag", () => {
    const ciphertext = encrypt("sensitive-data");
    const parts = ciphertext.split(":");
    // Tamper with the auth tag
    const fakeTag = Buffer.alloc(16, 0xff).toString("base64");
    const tampered = `${parts[0]}:${fakeTag}:${parts[2]}`;
    expect(() => decrypt(tampered)).toThrow();
  });

  test("throws when ENCRYPTION_KEY is not set", () => {
    const originalKey = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY environment variable is not set");
    process.env.ENCRYPTION_KEY = originalKey;
  });

  test("throws when ENCRYPTION_KEY is wrong length", () => {
    const originalKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = "tooshort";
    expect(() => encrypt("test")).toThrow("must be exactly 64 hex characters");
    process.env.ENCRYPTION_KEY = originalKey;
  });
});
