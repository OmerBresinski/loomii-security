import { z } from "zod";

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),

  // Redis
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  // WorkOS
  WORKOS_API_KEY: z.string().min(1, "WORKOS_API_KEY is required"),
  WORKOS_CLIENT_ID: z.string().min(1, "WORKOS_CLIENT_ID is required"),
  WORKOS_REDIRECT_URI: z.string().url("WORKOS_REDIRECT_URI must be a valid URL"),

  // Linear OAuth
  LINEAR_CLIENT_ID: z.string().min(1, "LINEAR_CLIENT_ID is required"),
  LINEAR_CLIENT_SECRET: z.string().min(1, "LINEAR_CLIENT_SECRET is required"),
  LINEAR_REDIRECT_URI: z.string().url("LINEAR_REDIRECT_URI must be a valid URL"),
  LINEAR_WEBHOOK_SECRET: z.string().min(1, "LINEAR_WEBHOOK_SECRET is required"),

  // Notion OAuth
  NOTION_CLIENT_ID: z.string().min(1, "NOTION_CLIENT_ID is required"),
  NOTION_CLIENT_SECRET: z.string().min(1, "NOTION_CLIENT_SECRET is required"),
  NOTION_REDIRECT_URI: z.string().url("NOTION_REDIRECT_URI must be a valid URL"),

  // AWS Bedrock (bearer token OR access key/secret)
  AWS_REGION: z.string().min(1, "AWS_REGION is required"),
  AWS_BEARER_TOKEN_BEDROCK: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),

  // Encryption
  ENCRYPTION_KEY: z
    .string()
    .length(64, "ENCRYPTION_KEY must be a 64-char hex string (32 bytes)"),

  // Application
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  API_PORT: z.coerce.number().default(3000),
  FRONTEND_URL: z.string().url("FRONTEND_URL must be a valid URL"),
  CORS_ORIGIN: z.string().min(1, "CORS_ORIGIN is required"),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    console.error(
      `\n❌ Environment validation failed:\n${errors}\n\nPlease check your .env file.\n`
    );
    process.exit(1);
  }

  return result.data;
}
