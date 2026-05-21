import "../test-setup";
import { describe, it, expect } from "bun:test";
import { processors, concurrency } from "./index";
import { ALL_QUEUE_NAMES, QUEUE_NAMES } from "@loomii/queue";

describe("processors registry", () => {
  it("has a processor for every queue", () => {
    for (const queueName of ALL_QUEUE_NAMES) {
      expect(processors[queueName]).toBeDefined();
      expect(typeof processors[queueName]).toBe("function");
    }
  });

  it("has concurrency configured for every queue", () => {
    for (const queueName of ALL_QUEUE_NAMES) {
      expect(concurrency[queueName]).toBeDefined();
      expect(concurrency[queueName]).toBeGreaterThan(0);
    }
  });

  it("review-generation has concurrency 3", () => {
    expect(concurrency[QUEUE_NAMES.REVIEW_GENERATION]).toBe(3);
  });

  it("risk-classification has concurrency 5", () => {
    expect(concurrency[QUEUE_NAMES.RISK_CLASSIFICATION]).toBe(5);
  });

  it("registers all 8 queues", () => {
    expect(ALL_QUEUE_NAMES).toHaveLength(8);
    expect(Object.keys(processors)).toHaveLength(8);
  });
});
