import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get the encryption key from environment.
 * Must be a 32-byte hex string (64 hex characters).
 * Lazily resolved so tests can set env before first call.
 */
function getKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is not set. Must be a 64-character hex string (32 bytes)."
    );
  }
  if (keyHex.length !== 64) {
    throw new Error(
      `ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). Got ${keyHex.length} characters.`
    );
  }
  return Buffer.from(keyHex, "hex");
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns format: `iv:authTag:ciphertext` (all base64-encoded)
 *
 * Each call uses a random IV, so the same plaintext produces different ciphertext.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

/**
 * Decrypts a ciphertext string produced by encrypt().
 * Expects format: `iv:authTag:ciphertext` (all base64-encoded)
 *
 * Throws on invalid/tampered ciphertext.
 */
export function decrypt(data: string): string {
  const key = getKey();
  const parts = data.split(":");

  if (parts.length !== 3) {
    throw new Error(
      "Invalid ciphertext format. Expected iv:authTag:ciphertext (base64-encoded)."
    );
  }

  const [ivB64, tagB64, cipherB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(cipherB64, "base64");

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length. Expected ${IV_LENGTH} bytes.`);
  }
  if (tag.length !== AUTH_TAG_LENGTH) {
    throw new Error(
      `Invalid auth tag length. Expected ${AUTH_TAG_LENGTH} bytes.`
    );
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return decipher.update(encrypted) + decipher.final("utf8");
}
