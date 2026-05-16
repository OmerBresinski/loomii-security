import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { validateEnv } from "./env";

describe("env validation", () => {
  const validEnv = {
    DATABASE_URL: "postgresql://user:pass@host:5432/loomii",
    REDIS_URL: "redis://default:pass@host:6379",
    WORKOS_API_KEY: "sk_test_123",
    WORKOS_CLIENT_ID: "client_123",
    WORKOS_REDIRECT_URI: "https://app.loomii.dev/auth/callback",
    LINEAR_CLIENT_ID: "linear_123",
    LINEAR_CLIENT_SECRET: "linear_secret",
    LINEAR_REDIRECT_URI: "https://app.loomii.dev/integrations/linear/callback",
    LINEAR_WEBHOOK_SECRET: "webhook_secret",
    NOTION_CLIENT_ID: "notion_123",
    NOTION_CLIENT_SECRET: "notion_secret",
    NOTION_REDIRECT_URI: "https://app.loomii.dev/integrations/notion/callback",
    AWS_REGION: "us-east-1",
    AWS_ACCESS_KEY_ID: "AKIAIOSFODNN7EXAMPLE",
    AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    ENCRYPTION_KEY:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    NODE_ENV: "development",
    API_PORT: "3000",
    FRONTEND_URL: "http://localhost:5173",
    CORS_ORIGIN: "http://localhost:5173",
  };

  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("passes with all vars present", () => {
    Object.assign(process.env, validEnv);
    const result = validateEnv();
    expect(result.API_PORT).toBe(3000);
    expect(result.NODE_ENV).toBe("development");
    expect(result.CORS_ORIGIN).toBe("http://localhost:5173");
  });

  it("throws on missing required vars", () => {
    // Clear relevant env vars
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
    delete process.env.WORKOS_API_KEY;

    // Mock process.exit to prevent test from exiting
    const mockExit = spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    expect(() => validateEnv()).toThrow("process.exit called");
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
  });

  it("defaults NODE_ENV to development", () => {
    Object.assign(process.env, validEnv);
    delete process.env.NODE_ENV;
    const result = validateEnv();
    expect(result.NODE_ENV).toBe("development");
  });

  it("defaults API_PORT to 3000", () => {
    Object.assign(process.env, validEnv);
    delete process.env.API_PORT;
    const result = validateEnv();
    expect(result.API_PORT).toBe(3000);
  });

  it("rejects invalid ENCRYPTION_KEY length", () => {
    Object.assign(process.env, validEnv);
    process.env.ENCRYPTION_KEY = "tooshort";

    const mockExit = spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    expect(() => validateEnv()).toThrow("process.exit called");
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
  });
});
