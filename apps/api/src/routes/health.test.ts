import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { healthRoute } from "./health";
import { requestId } from "../middleware/request-id";

describe("GET /health", () => {
  let app: Hono;

  beforeAll(() => {
    app = new Hono();
    app.use("*", requestId);
    app.route("/", healthRoute);
  });

  it("returns 200 with status field", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("healthy");
  });

  it("includes dependency statuses", async () => {
    const res = await app.request("/health");
    const body = await res.json();

    expect(body.dependencies).toBeDefined();
    expect(body.dependencies.database).toBeDefined();
    expect(body.dependencies.database.status).toBe("healthy");
    expect(body.dependencies.redis).toBeDefined();
    expect(body.dependencies.redis.status).toBe("healthy");
  });

  it("includes timestamp and latency", async () => {
    const res = await app.request("/health");
    const body = await res.json();

    expect(body.timestamp).toBeDefined();
    expect(body.latencyMs).toBeDefined();
    expect(typeof body.latencyMs).toBe("number");
  });

  it("includes X-Request-ID header", async () => {
    const res = await app.request("/health");
    const requestIdHeader = res.headers.get("X-Request-ID");

    expect(requestIdHeader).toBeDefined();
    expect(requestIdHeader).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });
});
