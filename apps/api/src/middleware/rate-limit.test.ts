import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Hono } from "hono";
import { requestId } from "./request-id";

// Track call count per key to simulate Redis INCR
let redisStore: Record<string, number> = {};

mock.module("@loomii/queue", () => ({
  createRedisConnection: () => ({
    multi: () => ({
      incr: function (key: string) {
        redisStore[key] = (redisStore[key] ?? 0) + 1;
        this._key = key;
        return this;
      },
      expire: function () {
        return this;
      },
      exec: function () {
        return Promise.resolve([
          [null, redisStore[this._key]],
          [null, 1],
        ]);
      },
      _key: "",
    }),
  }),
}));

// Import after mocking
const { rateLimiter } = await import("./rate-limit");

describe("rateLimiter", () => {
  let app: Hono;

  beforeEach(() => {
    redisStore = {};

    app = new Hono();
    app.use("*", requestId);
    // Simulate auth middleware setting userId
    app.use("*", async (c, next) => {
      c.set("userId", "user_123");
      await next();
    });
    app.use("*", rateLimiter);
    app.get("/test", (c) => c.json({ ok: true }));
  });

  it("allows requests under limit", async () => {
    const res = await app.request("/test");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("100");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("99");
    expect(res.headers.get("X-RateLimit-Reset")).toBeDefined();
  });

  it("includes rate limit headers on every response", async () => {
    const res = await app.request("/test");
    expect(res.headers.get("X-RateLimit-Limit")).toBe("100");
    expect(res.headers.get("X-RateLimit-Remaining")).toBeDefined();
    expect(res.headers.get("X-RateLimit-Reset")).toBeDefined();
  });

  it("returns 429 when limit exceeded", async () => {
    // Simulate 100 requests already made
    const key = Object.keys(redisStore)[0] ?? "ratelimit:user_123:0";
    // Pre-fill to simulate 100 requests
    for (let i = 0; i < 100; i++) {
      await app.request("/test");
    }

    // 101st request
    const res = await app.request("/test");
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.error.code).toBe("TOO_MANY_REQUESTS");
    expect(body.error.message).toContain("Rate limit exceeded");
    expect(body.error.requestId).toBeDefined();
  });

  it("includes Retry-After header on 429", async () => {
    // Exhaust the limit
    for (let i = 0; i < 100; i++) {
      await app.request("/test");
    }

    const res = await app.request("/test");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeDefined();
    const retryAfter = Number(res.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it("different users have independent limits", async () => {
    // Create a second app with different user
    const app2 = new Hono();
    app2.use("*", requestId);
    app2.use("*", async (c, next) => {
      c.set("userId", "user_456");
      await next();
    });
    app2.use("*", rateLimiter);
    app2.get("/test", (c) => c.json({ ok: true }));

    // Exhaust limit for user_123
    for (let i = 0; i < 100; i++) {
      await app.request("/test");
    }
    const blockedRes = await app.request("/test");
    expect(blockedRes.status).toBe(429);

    // user_456 should still work
    const allowedRes = await app2.request("/test");
    expect(allowedRes.status).toBe(200);
  });

  it("skips rate limiting when no userId", async () => {
    const publicApp = new Hono();
    publicApp.use("*", requestId);
    // No userId set
    publicApp.use("*", rateLimiter);
    publicApp.get("/test", (c) => c.json({ ok: true }));

    const res = await publicApp.request("/test");
    expect(res.status).toBe(200);
    // No rate limit headers when skipped
    expect(res.headers.get("X-RateLimit-Limit")).toBeNull();
  });
});
