/**
 * Embedding clustering utility for backfill project grouping.
 * Uses agglomerative clustering with average linkage and cosine similarity.
 *
 * Pure computation utility - no DB, Redis, or external service dependencies.
 */

export interface ClusterItem {
  id: string;
  embedding: number[];
}

export interface ClusterOptions {
  /** Minimum cosine similarity to merge clusters (default 0.78) */
  similarityThreshold?: number;
  /** Minimum number of items to form a valid cluster (default 3) */
  minClusterSize?: number;
}

export interface ClusterResult {
  clusters: Array<{
    items: string[];
    centroid: number[];
  }>;
  unclustered: string[];
}

/**
 * Compute cosine similarity between two vectors.
 * Returns a value between -1 and 1, where 1 means identical direction.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Compute the centroid (average) of a set of embedding vectors.
 */
function computeCentroid(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return [];
  const dim = embeddings[0].length;
  const centroid = new Array<number>(dim).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < dim; i++) {
      centroid[i] += embedding[i];
    }
  }

  const count = embeddings.length;
  for (let i = 0; i < dim; i++) {
    centroid[i] /= count;
  }

  return centroid;
}

/**
 * Compute average linkage similarity between two clusters.
 * Average of all pairwise cosine similarities between members.
 */
function averageLinkage(
  clusterA: number[][],
  clusterB: number[][]
): number {
  let totalSimilarity = 0;
  let pairCount = 0;

  for (const a of clusterA) {
    for (const b of clusterB) {
      totalSimilarity += cosineSimilarity(a, b);
      pairCount++;
    }
  }

  return pairCount > 0 ? totalSimilarity / pairCount : 0;
}

/**
 * Agglomerative clustering with average linkage using cosine similarity.
 *
 * Algorithm:
 * 1. Start with each item as its own cluster
 * 2. Repeatedly merge the two most similar clusters (average linkage)
 * 3. Stop when max inter-cluster similarity < threshold
 * 4. Filter out clusters smaller than minClusterSize (move to unclustered)
 * 5. Compute centroid for each remaining cluster
 */
export function clusterByCosineSimilarity(
  items: ClusterItem[],
  options?: ClusterOptions
): ClusterResult {
  const similarityThreshold = options?.similarityThreshold ?? 0.78;
  const minClusterSize = options?.minClusterSize ?? 3;

  // Edge cases
  if (items.length === 0) {
    return { clusters: [], unclustered: [] };
  }

  if (items.length === 1) {
    return { clusters: [], unclustered: [items[0].id] };
  }

  // Initialize: each item is its own cluster
  // Track cluster membership by index
  type InternalCluster = {
    itemIndices: number[];
    embeddings: number[][];
  };

  let clusters: InternalCluster[] = items.map((item, idx) => ({
    itemIndices: [idx],
    embeddings: [item.embedding],
  }));

  // Compute initial similarity matrix (upper triangle)
  // similarity[i][j] = average linkage between cluster i and cluster j
  const n = clusters.length;
  const similarity: number[][] = Array.from({ length: n }, () =>
    new Array<number>(n).fill(0)
  );

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      similarity[i][j] = cosineSimilarity(
        items[i].embedding,
        items[j].embedding
      );
      similarity[j][i] = similarity[i][j];
    }
  }

  // Track which clusters are still active
  const active = new Array<boolean>(n).fill(true);

  // Agglomerative merge loop
  while (true) {
    // Find the pair of active clusters with highest similarity
    let maxSim = -Infinity;
    let mergeI = -1;
    let mergeJ = -1;

    for (let i = 0; i < n; i++) {
      if (!active[i]) continue;
      for (let j = i + 1; j < n; j++) {
        if (!active[j]) continue;
        if (similarity[i][j] > maxSim) {
          maxSim = similarity[i][j];
          mergeI = i;
          mergeJ = j;
        }
      }
    }

    // Stop if no valid pair or below threshold
    if (mergeI === -1 || maxSim < similarityThreshold) {
      break;
    }

    // Merge cluster j into cluster i
    clusters[mergeI] = {
      itemIndices: [
        ...clusters[mergeI].itemIndices,
        ...clusters[mergeJ].itemIndices,
      ],
      embeddings: [
        ...clusters[mergeI].embeddings,
        ...clusters[mergeJ].embeddings,
      ],
    };
    active[mergeJ] = false;

    // Update similarity matrix for the merged cluster (average linkage)
    for (let k = 0; k < n; k++) {
      if (!active[k] || k === mergeI) continue;
      const newSim = averageLinkage(
        clusters[mergeI].embeddings,
        clusters[k].embeddings
      );
      similarity[mergeI][k] = newSim;
      similarity[k][mergeI] = newSim;
    }
  }

  // Collect active clusters and filter by minClusterSize
  const result: ClusterResult = {
    clusters: [],
    unclustered: [],
  };

  for (let i = 0; i < n; i++) {
    if (!active[i]) continue;

    const cluster = clusters[i];
    if (cluster.itemIndices.length >= minClusterSize) {
      result.clusters.push({
        items: cluster.itemIndices.map((idx) => items[idx].id),
        centroid: computeCentroid(cluster.embeddings),
      });
    } else {
      // Dissolve small clusters into unclustered
      for (const idx of cluster.itemIndices) {
        result.unclustered.push(items[idx].id);
      }
    }
  }

  return result;
}
