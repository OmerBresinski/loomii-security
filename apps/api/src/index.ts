import { Hono } from "hono";
import { cors } from "hono/cors";
import { validateEnv } from "./lib/env";
import { requestId } from "./middleware/request-id";
import { loggerMiddleware, logger } from "./middleware/logger";
import { errorHandler } from "./middleware/error-handler";
import { authMiddleware } from "./middleware/auth";
import { rateLimiter } from "./middleware/rate-limit";
import { healthRoute } from "./routes/health";
import { authRoutes } from "./routes/auth";
import { v1Routes } from "./routes/v1/index";

// Validate environment variables on startup (fail fast)
const env = validateEnv();

const app = new Hono();

// Global error handler
app.onError(errorHandler);

// Global middleware
app.use("*", requestId);
app.use("*", loggerMiddleware);
app.use(
  "*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    exposeHeaders: ["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
    credentials: true,
  })
);

// Public routes (no auth required)
app.route("/", healthRoute);
app.route("/", authRoutes);

// Protected routes - auth + rate limiting
app.use("/api/*", authMiddleware);
app.use("/api/*", rateLimiter);
app.route("/api/v1", v1Routes);

// 404 handler
app.notFound((c) => {
  const requestId = c.get("requestId") as string;
  return c.json(
    {
      error: {
        code: "NOT_FOUND",
        message: `Route not found: ${c.req.method} ${c.req.path}`,
        requestId,
      },
    },
    404
  );
});

logger.info({ port: env.API_PORT }, `Loomii API server starting on port ${env.API_PORT}`);

export default {
  port: env.API_PORT,
  fetch: app.fetch,
};
