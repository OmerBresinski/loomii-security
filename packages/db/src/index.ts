import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

// Create PostgreSQL connection pool
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create Prisma adapter
const adapter = new PrismaPg(pool);

// Singleton PrismaClient instance
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db: PrismaClient =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

// Re-export Prisma types and client
export { PrismaClient, Prisma } from "@prisma/client";
export type {
  Tenant,
  User,
  Integration,
  Event,
  ContextBundle,
  Embedding,
  Policy,
  Review,
  ReviewVersion,
  Finding,
  FindingRelation,
  ThreatModel,
  TmComponent,
  TmDataFlow,
  TmTrustBoundary,
  TmEntryPoint,
  TmAsset,
  TmThreat,
  TmChange,
  TmGap,
  Project,
  ProjectSource,
} from "@prisma/client";
export {
  Role,
  IntegrationProvider,
  IntegrationStatus,
  EventStatus,
  RiskLevel,
  BundleStatus,
  ThreatModelStatus,
  StrideCategory,
  Severity,
  ReviewStatus,
  ReviewMode,
  FindingType,
  FindingStatus,
  Effort,
  RelationType,
  SourceType,
  LinkMethod,
} from "@prisma/client";

// Export pgvector helpers
export { vectorSearch, insertEmbedding } from "./extensions/pgvector";
export type {
  VectorSearchOptions,
  VectorSearchResult,
} from "./extensions/pgvector";
