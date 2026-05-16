import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requestId } from "./request-id";
import { errorHandler } from "./error-handler";

describe("error handler", () => {
  let app: Hono;

  beforeAll(() => {
    // Suppress pino logs during testing
    process.env.NODE_ENV = "test";

    app = new Hono();
    app.onError(errorHandler);
    app.use("*", requestId);

    // Route that throws a generic error
    app.get("/error", () => {
      throw new Error("Something went wrong");
    });

    // Route that throws an HTTP exception
    app.get("/http-error", () => {
      throw new HTTPException(403, { message: "Access denied" });
    });
  });

  it("formats errors consistently", async () => {
    const res = await app.request("/error");
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(body.error.message).toBe("An unexpected error occurred");
    expect(body.error.requestId).toBeDefined();
  });

  it("includes requestId in error response", async () => {
    const res = await app.request("/error");
    const body = await res.json();
    const headerRequestId = res.headers.get("X-Request-ID");

    expect(body.error.requestId).toBe(headerRequestId);
  });

  it("handles HTTPException with correct status and message", async () => {
    const res = await app.request("/http-error");
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toBe("Access denied");
  });

  it("hides stack trace in production", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const res = await app.request("/error");
    const body = await res.json();

    expect(body.error.stack).toBeUndefined();

    process.env.NODE_ENV = originalEnv;
  });

  it("shows stack trace in development", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    const res = await app.request("/error");
    const body = await res.json();

    expect(body.error.stack).toBeDefined();
    expect(body.error.stack).toContain("Error: Something went wrong");

    process.env.NODE_ENV = originalEnv;
  });
});
