import pino from "pino";
import { createMiddleware } from "hono/factory";

export const logger = pino({
  level: process.env.NODE_ENV === "test" ? "silent" : "info",
  transport:
    process.env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  base: { service: "api" },
});

export const loggerMiddleware = createMiddleware(async (c, next) => {
  const start = Date.now();
  const requestId = c.get("requestId") as string;
  const method = c.req.method;
  const path = c.req.path;

  const childLogger = logger.child({ requestId });
  c.set("logger", childLogger);

  await next();

  const latencyMs = Date.now() - start;
  const status = c.res.status;

  childLogger.info(
    {
      method,
      path,
      status,
      latencyMs,
    },
    `${method} ${path} ${status} ${latencyMs}ms`
  );
});
