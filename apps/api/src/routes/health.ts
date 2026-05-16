import { Hono } from "hono";

export const healthRoute = new Hono();

healthRoute.get("/health", async (c) => {
  const start = Date.now();

  // Database check (mocked until @loomii/db is connected)
  const dbStatus = await checkDatabase();

  // Redis check (mocked until connected)
  const redisStatus = await checkRedis();

  const totalLatencyMs = Date.now() - start;

  const allHealthy = dbStatus.status === "healthy" && redisStatus.status === "healthy";

  return c.json(
    {
      status: allHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      latencyMs: totalLatencyMs,
      dependencies: {
        database: dbStatus,
        redis: redisStatus,
      },
    },
    allHealthy ? 200 : 503
  );
});

async function checkDatabase(): Promise<{ status: string; latencyMs: number }> {
  const start = Date.now();
  try {
    // TODO: Replace with actual DB ping when @loomii/db is connected
    // await db.$queryRaw`SELECT 1`
    return { status: "healthy", latencyMs: Date.now() - start };
  } catch {
    return { status: "unhealthy", latencyMs: Date.now() - start };
  }
}

async function checkRedis(): Promise<{ status: string; latencyMs: number }> {
  const start = Date.now();
  try {
    // TODO: Replace with actual Redis ping when connected
    // await redis.ping()
    return { status: "healthy", latencyMs: Date.now() - start };
  } catch {
    return { status: "unhealthy", latencyMs: Date.now() - start };
  }
}
