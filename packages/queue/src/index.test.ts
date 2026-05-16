import { describe, it, expect, mock } from "bun:test";

// Mock ioredis before importing the module
mock.module("ioredis", () => ({
  default: class MockRedis {
    constructor() {}
    disconnect() {}
  },
  Redis: class MockRedis {
    constructor() {}
    disconnect() {}
  },
}));

import {
  QUEUE_NAMES,
  ALL_QUEUE_NAMES,
  createRedisConnection,
  contextAssemblyQueue,
  riskClassificationQueue,
  embeddingQueue,
  notionPollingQueue,
  integrationHealthQueue,
  reviewQueue,
  threatModelQueue,
  eventsQueue,
} from "./index";

import type {
  ContextAssemblyPayload,
  RiskClassificationPayload,
  EmbeddingGenerationPayload,
  NotionPollingPayload,
  IntegrationHealthPayload,
  ReviewGenerationPayload,
  ThreatModelUpdatePayload,
  EventsPayload,
  QueuePayloadMap,
  QueueName,
} from "./index";

describe("@loomii/queue", () => {
  describe("queue name constants", () => {
    it("exports all 8 queue name constants", () => {
      expect(Object.keys(QUEUE_NAMES)).toHaveLength(8);
    });

    it("ALL_QUEUE_NAMES contains all 8 queue names", () => {
      expect(ALL_QUEUE_NAMES).toHaveLength(8);
      expect(ALL_QUEUE_NAMES).toContain("context-assembly");
      expect(ALL_QUEUE_NAMES).toContain("risk-classification");
      expect(ALL_QUEUE_NAMES).toContain("embedding-generation");
      expect(ALL_QUEUE_NAMES).toContain("notion-polling");
      expect(ALL_QUEUE_NAMES).toContain("integration-health");
      expect(ALL_QUEUE_NAMES).toContain("review-generation");
      expect(ALL_QUEUE_NAMES).toContain("threat-model-update");
      expect(ALL_QUEUE_NAMES).toContain("events");
    });

    it("queue names match expected values", () => {
      expect(QUEUE_NAMES.CONTEXT_ASSEMBLY).toBe("context-assembly");
      expect(QUEUE_NAMES.RISK_CLASSIFICATION).toBe("risk-classification");
      expect(QUEUE_NAMES.EMBEDDING_GENERATION).toBe("embedding-generation");
      expect(QUEUE_NAMES.NOTION_POLLING).toBe("notion-polling");
      expect(QUEUE_NAMES.INTEGRATION_HEALTH).toBe("integration-health");
      expect(QUEUE_NAMES.REVIEW_GENERATION).toBe("review-generation");
      expect(QUEUE_NAMES.THREAT_MODEL_UPDATE).toBe("threat-model-update");
      expect(QUEUE_NAMES.EVENTS).toBe("events");
    });
  });

  describe("queue instances", () => {
    it("exports all 8 queue instances", () => {
      expect(contextAssemblyQueue).toBeDefined();
      expect(riskClassificationQueue).toBeDefined();
      expect(embeddingQueue).toBeDefined();
      expect(notionPollingQueue).toBeDefined();
      expect(integrationHealthQueue).toBeDefined();
      expect(reviewQueue).toBeDefined();
      expect(threatModelQueue).toBeDefined();
      expect(eventsQueue).toBeDefined();
    });

    it("queue instances have correct names", () => {
      expect(contextAssemblyQueue.name).toBe("context-assembly");
      expect(riskClassificationQueue.name).toBe("risk-classification");
      expect(embeddingQueue.name).toBe("embedding-generation");
      expect(notionPollingQueue.name).toBe("notion-polling");
      expect(integrationHealthQueue.name).toBe("integration-health");
      expect(reviewQueue.name).toBe("review-generation");
      expect(threatModelQueue.name).toBe("threat-model-update");
      expect(eventsQueue.name).toBe("events");
    });
  });

  describe("connection factory", () => {
    it("exports createRedisConnection function", () => {
      expect(createRedisConnection).toBeDefined();
      expect(typeof createRedisConnection).toBe("function");
    });
  });

  describe("type exports (compile-time verification)", () => {
    it("payload types are structurally correct", () => {
      // These verify the types compile - runtime checks on shape
      const contextPayload: ContextAssemblyPayload = {
        eventId: "evt_1",
        tenantId: "t_1",
        sourceType: "linear",
        sourceId: "src_1",
      };
      expect(contextPayload.tenantId).toBe("t_1");

      const riskPayload: RiskClassificationPayload = {
        tenantId: "t_1",
        contextId: "ctx_1",
        designDocId: "doc_1",
      };
      expect(riskPayload.contextId).toBe("ctx_1");

      const embeddingPayload: EmbeddingGenerationPayload = {
        tenantId: "t_1",
        documentId: "doc_1",
        content: "some content",
      };
      expect(embeddingPayload.content).toBe("some content");

      const notionPayload: NotionPollingPayload = {
        tenantId: "t_1",
        integrationId: "int_1",
      };
      expect(notionPayload.integrationId).toBe("int_1");

      const healthPayload: IntegrationHealthPayload = {
        tenantId: "t_1",
        integrationId: "int_1",
        provider: "notion",
      };
      expect(healthPayload.provider).toBe("notion");

      const reviewPayload: ReviewGenerationPayload = {
        tenantId: "t_1",
        contextId: "ctx_1",
        reviewType: "design-review",
      };
      expect(reviewPayload.reviewType).toBe("design-review");

      const threatPayload: ThreatModelUpdatePayload = {
        tenantId: "t_1",
        designDocId: "doc_1",
        changeType: "created",
      };
      expect(threatPayload.changeType).toBe("created");

      const eventsPayload: EventsPayload = {
        tenantId: "t_1",
        eventType: "issue.created",
        data: { id: "123" },
        timestamp: new Date().toISOString(),
      };
      expect(eventsPayload.eventType).toBe("issue.created");
    });
  });
});
