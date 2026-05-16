import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "./logger";

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
    stack?: string;
  };
}

export const errorHandler: ErrorHandler = (err, c) => {
  const requestId = (c.get("requestId") as string) ?? "unknown";
  const isDev = process.env.NODE_ENV === "development";

  let status = 500;
  let code = "INTERNAL_SERVER_ERROR";
  let message = "An unexpected error occurred";

  if (err instanceof HTTPException) {
    status = err.status;
    code = httpStatusToCode(status);
    message = err.message;
  }

  const childLogger = c.get("logger") ?? logger;
  childLogger.error(
    {
      err,
      requestId,
      code,
      status,
    },
    `Error: ${message}`
  );

  const response: ErrorResponse = {
    error: {
      code,
      message,
      requestId,
      ...(isDev && err.stack ? { stack: err.stack } : {}),
    },
  };

  return c.json(response, status as any);
};

function httpStatusToCode(status: number): string {
  const codes: Record<number, string> = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "UNPROCESSABLE_ENTITY",
    429: "TOO_MANY_REQUESTS",
    500: "INTERNAL_SERVER_ERROR",
    502: "BAD_GATEWAY",
    503: "SERVICE_UNAVAILABLE",
  };
  return codes[status] ?? "INTERNAL_SERVER_ERROR";
}
