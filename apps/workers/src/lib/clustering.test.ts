/**
 * Tests for Embedding Clustering Utility.
 *
 * Tests cover:
 * - Cosine similarity computation (helper function)
 * - Grouping similar items together (AC1)
 * - Items below threshold returned as unclustered (AC2)
 * - Clusters smaller than minClusterSize dissolved (AC3)
 * - Centroid correctly computed as average of member embeddings (AC4)
 * - Edge cases: empty input, single item, all identical embeddings (AC5)
 * - Performance: 500 items < 500ms (AC6)
 */
import "../test-setup";
import { describe, it, expect } from "bun:test";
import {
  cosineSimilarity,
  clusterByCosineSimilarity,
  type ClusterItem,
} from "../lib/clustering";

// --- Test Helpers ---

/** Create a unit vector in the given direction (low-dimensional for clarity) */
function makeEmbedding(base: number[], dim = 1024): number[] {
  const vec = new Array<number>(dim).fill(0);
  for (let i = 0; i < base.length; i++) {
    vec[i] = base[i];
  }
  // Normalize to unit vector
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

/** Create a cluster of similar embeddings by perturbing a base vector */
function makeSimilarCluster(
  base: number[],
  count: number,
  noise: number = 0.05,
  dim = 1024
): number[][] {
  const embeddings: number[][] = [];
  for (let i = 0; i < count; i++) {
    const perturbed = base.map(
      (v) => v + (Math.random() - 0.5) * noise * 2
    );
    embeddings.push(makeEmbedding(perturbed, dim));
  }
  return embeddings;
}

// --- Cosine Similarity Tests ---

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const vec = [1, 2, 3, 4, 5];
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0, 10);
  });

  it("returns -1 for opposite vectors", () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 10);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 10);
  });

  it("returns 0 when either vector is zero", () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it("is scale-invariant", () => {
    const a = [1, 2, 3];
    const b = [2, 4, 6]; // same direction, different magnitude
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 10);
  });

  it("computes correctly for known values", () => {
    const a = [1, 0];
    const b = [1, 1];
    // cos(45°) = √2/2 ≈ 0.7071
    expect(cosineSimilarity(a, b)).toBeCloseTo(Math.SQRT2 / 2, 5);
  });

  it("handles 1024-dimension vectors", () => {
    const dim = 1024;
    const a = new Array(dim).fill(0).map(() => Math.random());
    // Same vector should be 1
    expect(cosineSimilarity(a, a)).toBeCloseTo(1.0, 10);
  });
});

// --- Clustering Tests ---

describe("clusterByCosineSimilarity", () => {
  describe("edge cases (AC5)", () => {
    it("returns empty result for empty input", () => {
      const result = clusterByCosineSimilarity([]);
      expect(result.clusters).toHaveLength(0);
      expect(result.unclustered).toHaveLength(0);
    });

    it("returns single item as unclustered", () => {
      const items: ClusterItem[] = [
        { id: "item-1", embedding: makeEmbedding([1, 0, 0]) },
      ];
      const result = clusterByCosineSimilarity(items);
      expect(result.clusters).toHaveLength(0);
      expect(result.unclustered).toEqual(["item-1"]);
    });

    it("handles two items (below minClusterSize=3 default)", () => {
      const items: ClusterItem[] = [
        { id: "a", embedding: makeEmbedding([1, 0, 0]) },
        { id: "b", embedding: makeEmbedding([1, 0.01, 0]) },
      ];
      const result = clusterByCosineSimilarity(items);
      expect(result.clusters).toHaveLength(0);
      expect(result.unclustered).toHaveLength(2);
    });

    it("handles all identical embeddings", () => {
      const embedding = makeEmbedding([1, 1, 1]);
      const items: ClusterItem[] = Array.from({ length: 5 }, (_, i) => ({
        id: `item-${i}`,
        embedding: [...embedding],
      }));
      const result = clusterByCosineSimilarity(items);
      // All should end up in one cluster
      expect(result.clusters).toHaveLength(1);
      expect(result.clusters[0].items).toHaveLength(5);
      expect(result.unclustered).toHaveLength(0);
    });
  });

  describe("basic clustering (AC1)", () => {
    it("groups similar items into a cluster", () => {
      // Create 4 very similar items (cluster A) and 4 very different items (cluster B)
      const clusterABase = [1, 0, 0, 0, 0];
      const clusterBBase = [0, 0, 0, 0, 1];

      const itemsA = makeSimilarCluster(clusterABase, 4, 0.02);
      const itemsB = makeSimilarCluster(clusterBBase, 4, 0.02);

      const items: ClusterItem[] = [
        ...itemsA.map((emb, i) => ({ id: `a-${i}`, embedding: emb })),
        ...itemsB.map((emb, i) => ({ id: `b-${i}`, embedding: emb })),
      ];

      const result = clusterByCosineSimilarity(items);

      expect(result.clusters).toHaveLength(2);
      expect(result.unclustered).toHaveLength(0);

      // Each cluster should have 4 items
      const sizes = result.clusters.map((c) => c.items.length).sort();
      expect(sizes).toEqual([4, 4]);

      // Verify cluster coherence: all 'a-' items in same cluster
      const clusterWithA = result.clusters.find((c) =>
        c.items.includes("a-0")
      )!;
      expect(clusterWithA.items).toContain("a-1");
      expect(clusterWithA.items).toContain("a-2");
      expect(clusterWithA.items).toContain("a-3");
    });

    it("separates three distinct clusters", () => {
      const bases = [
        [1, 0, 0, 0, 0],
        [0, 1, 0, 0, 0],
        [0, 0, 1, 0, 0],
      ];

      const items: ClusterItem[] = [];
      for (let c = 0; c < 3; c++) {
        const cluster = makeSimilarCluster(bases[c], 4, 0.02);
        for (let i = 0; i < cluster.length; i++) {
          items.push({ id: `c${c}-${i}`, embedding: cluster[i] });
        }
      }

      const result = clusterByCosineSimilarity(items);
      expect(result.clusters).toHaveLength(3);
      expect(result.unclustered).toHaveLength(0);
    });
  });

  describe("unclustered items (AC2)", () => {
    it("returns dissimilar items as unclustered", () => {
      // 4 similar items forming a cluster + 2 random outliers
      const clusterBase = [1, 0, 0, 0, 0];
      const clusterEmbeddings = makeSimilarCluster(clusterBase, 4, 0.02);

      const items: ClusterItem[] = [
        ...clusterEmbeddings.map((emb, i) => ({
          id: `cluster-${i}`,
          embedding: emb,
        })),
        { id: "outlier-1", embedding: makeEmbedding([0, 1, 0, 0, 0]) },
        { id: "outlier-2", embedding: makeEmbedding([0, 0, 1, 0, 0]) },
      ];

      const result = clusterByCosineSimilarity(items);
      expect(result.clusters).toHaveLength(1);
      expect(result.clusters[0].items).toHaveLength(4);
      expect(result.unclustered).toContain("outlier-1");
      expect(result.unclustered).toContain("outlier-2");
    });
  });

  describe("minClusterSize (AC3)", () => {
    it("dissolves clusters smaller than minClusterSize", () => {
      // Create 5 similar items and 2 other similar items (below min of 3)
      const bigCluster = makeSimilarCluster([1, 0, 0, 0, 0], 5, 0.02);
      const smallCluster = makeSimilarCluster([0, 0, 0, 0, 1], 2, 0.02);

      const items: ClusterItem[] = [
        ...bigCluster.map((emb, i) => ({ id: `big-${i}`, embedding: emb })),
        ...smallCluster.map((emb, i) => ({
          id: `small-${i}`,
          embedding: emb,
        })),
      ];

      const result = clusterByCosineSimilarity(items);
      expect(result.clusters).toHaveLength(1);
      expect(result.clusters[0].items).toHaveLength(5);
      expect(result.unclustered).toContain("small-0");
      expect(result.unclustered).toContain("small-1");
    });

    it("respects custom minClusterSize", () => {
      const cluster = makeSimilarCluster([1, 0, 0, 0, 0], 4, 0.02);
      const items: ClusterItem[] = cluster.map((emb, i) => ({
        id: `item-${i}`,
        embedding: emb,
      }));

      // With minClusterSize=5, a cluster of 4 should be dissolved
      const result = clusterByCosineSimilarity(items, { minClusterSize: 5 });
      expect(result.clusters).toHaveLength(0);
      expect(result.unclustered).toHaveLength(4);

      // With minClusterSize=2, it should form a cluster
      const result2 = clusterByCosineSimilarity(items, { minClusterSize: 2 });
      expect(result2.clusters).toHaveLength(1);
      expect(result2.unclustered).toHaveLength(0);
    });
  });

  describe("centroid computation (AC4)", () => {
    it("computes centroid as average of member embeddings", () => {
      // Use 3 known vectors so we can verify the centroid
      const dim = 1024;
      const v1 = new Array(dim).fill(0);
      const v2 = new Array(dim).fill(0);
      const v3 = new Array(dim).fill(0);
      v1[0] = 1;
      v1[1] = 0;
      v2[0] = 1;
      v2[1] = 0.1;
      v3[0] = 1;
      v3[1] = -0.1;

      // Normalize
      const norm = (v: number[]) => {
        const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
        return v.map((x) => x / n);
      };
      const items: ClusterItem[] = [
        { id: "a", embedding: norm(v1) },
        { id: "b", embedding: norm(v2) },
        { id: "c", embedding: norm(v3) },
      ];

      const result = clusterByCosineSimilarity(items, {
        similarityThreshold: 0.5,
        minClusterSize: 3,
      });

      expect(result.clusters).toHaveLength(1);
      const centroid = result.clusters[0].centroid;

      // Centroid should be average of the three vectors
      const expected = items
        .reduce(
          (acc, item) => {
            for (let i = 0; i < dim; i++) acc[i] += item.embedding[i];
            return acc;
          },
          new Array(dim).fill(0)
        )
        .map((v) => v / 3);

      for (let i = 0; i < dim; i++) {
        expect(centroid[i]).toBeCloseTo(expected[i], 10);
      }
    });
  });

  describe("custom similarity threshold", () => {
    it("higher threshold creates fewer/smaller clusters", () => {
      const items: ClusterItem[] = makeSimilarCluster(
        [1, 0, 0, 0, 0],
        6,
        0.15
      ).map((emb, i) => ({ id: `item-${i}`, embedding: emb }));

      const looseResult = clusterByCosineSimilarity(items, {
        similarityThreshold: 0.5,
        minClusterSize: 3,
      });
      const strictResult = clusterByCosineSimilarity(items, {
        similarityThreshold: 0.99,
        minClusterSize: 3,
      });

      // Loose threshold should cluster more items
      const looseClusteredCount = looseResult.clusters.reduce(
        (sum, c) => sum + c.items.length,
        0
      );
      const strictClusteredCount = strictResult.clusters.reduce(
        (sum, c) => sum + c.items.length,
        0
      );
      expect(looseClusteredCount).toBeGreaterThanOrEqual(strictClusteredCount);
    });
  });

  describe("performance (AC6)", () => {
    it("handles 500 items in under 500ms", () => {
      const dim = 1024;
      // Generate 500 items with random embeddings
      const items: ClusterItem[] = Array.from({ length: 500 }, (_, i) => {
        const embedding = new Array(dim)
          .fill(0)
          .map(() => Math.random() - 0.5);
        // Normalize
        const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
        return {
          id: `item-${i}`,
          embedding: embedding.map((v) => v / norm),
        };
      });

      const start = performance.now();
      clusterByCosineSimilarity(items, {
        similarityThreshold: 0.78,
        minClusterSize: 3,
      });
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(500);
    });
  });
});
