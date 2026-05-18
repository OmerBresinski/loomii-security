/**
 * Content Chunker
 *
 * Splits text content into ~500-token chunks with 50-token overlap.
 * Splitting strategy (in priority order):
 * 1. Double newlines (paragraph boundaries)
 * 2. Single newlines
 * 3. Sentence boundaries (. ! ?)
 *
 * Token estimation: chars / 4 (good enough for chunking decisions).
 */

const TARGET_CHUNK_TOKENS = 500;
const OVERLAP_TOKENS = 50;
const CHARS_PER_TOKEN = 4;

/** Convert token count to character count */
function tokensToChars(tokens: number): number {
  return tokens * CHARS_PER_TOKEN;
}

/** Estimate token count from character count */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export interface Chunk {
  /** Zero-based chunk index */
  index: number;
  /** The text content of this chunk */
  content: string;
  /** Estimated token count */
  tokens: number;
}

/**
 * Split text into segments by a delimiter, preserving the delimiter at the end of each segment.
 */
function splitByDelimiter(text: string, delimiter: string): string[] {
  const parts = text.split(delimiter);
  const segments: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i < parts.length - 1) {
      // Append delimiter back to preserve paragraph/line boundaries
      segments.push(part + delimiter);
    } else if (part.length > 0) {
      segments.push(part);
    }
  }

  return segments;
}

/**
 * Split text by sentence boundaries (. ! ? followed by space or end).
 */
function splitBySentences(text: string): string[] {
  const sentences: string[] = [];
  // Match sentences ending with . ! ? followed by whitespace or end of string
  const regex = /[^.!?]*[.!?]+(?:\s+|$)|[^.!?]+$/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match[0].trim().length > 0) {
      sentences.push(match[0]);
    }
  }

  // Fallback: if regex didn't produce results, return original text
  if (sentences.length === 0 && text.trim().length > 0) {
    sentences.push(text);
  }

  return sentences;
}

/**
 * Break a segment that exceeds the target size into smaller pieces.
 * Uses progressively finer splitting (newlines -> sentences -> hard cut).
 */
function breakLargeSegment(segment: string, targetChars: number): string[] {
  if (segment.length <= targetChars) {
    return [segment];
  }

  // Try splitting by single newlines first
  const lines = splitByDelimiter(segment, "\n");
  if (lines.length > 1) {
    return mergeSegmentsIntoChunks(lines, targetChars);
  }

  // Try splitting by sentences
  const sentences = splitBySentences(segment);
  if (sentences.length > 1) {
    return mergeSegmentsIntoChunks(sentences, targetChars);
  }

  // Hard cut as last resort (avoid mid-word if possible)
  const pieces: string[] = [];
  let remaining = segment;
  while (remaining.length > targetChars) {
    // Find a space near the target to avoid cutting mid-word
    let cutPoint = remaining.lastIndexOf(" ", targetChars);
    if (cutPoint <= 0) {
      cutPoint = targetChars;
    }
    pieces.push(remaining.slice(0, cutPoint));
    remaining = remaining.slice(cutPoint).trimStart();
  }
  if (remaining.length > 0) {
    pieces.push(remaining);
  }

  return pieces;
}

/**
 * Merge small segments into chunks that approach (but don't exceed) the target size.
 */
function mergeSegmentsIntoChunks(
  segments: string[],
  targetChars: number
): string[] {
  const chunks: string[] = [];
  let currentChunk = "";

  for (const segment of segments) {
    // If adding this segment would exceed target, flush current chunk
    if (
      currentChunk.length > 0 &&
      currentChunk.length + segment.length > targetChars
    ) {
      chunks.push(currentChunk);
      currentChunk = "";
    }

    // If segment itself exceeds target, break it down further
    if (segment.length > targetChars) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = "";
      }
      const subChunks = breakLargeSegment(segment, targetChars);
      chunks.push(...subChunks);
    } else {
      currentChunk += segment;
    }
  }

  // Flush remaining content
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Apply overlap between adjacent chunks.
 * Takes the last ~50 tokens from the previous chunk and prepends to the next.
 */
function applyOverlap(chunks: string[], overlapChars: number): string[] {
  if (chunks.length <= 1) return chunks;

  const result: string[] = [chunks[0]];

  for (let i = 1; i < chunks.length; i++) {
    const prevChunk = chunks[i - 1];
    // Take the last overlapChars characters from the previous chunk
    const overlapText = prevChunk.slice(-overlapChars);
    // Find a clean boundary (space or newline) in the overlap to avoid mid-word
    const cleanStart = overlapText.indexOf(" ");
    const cleanOverlap =
      cleanStart > 0 ? overlapText.slice(cleanStart + 1) : overlapText;
    result.push(cleanOverlap + chunks[i]);
  }

  return result;
}

/**
 * Chunk content into ~500-token segments with 50-token overlap.
 *
 * @param content - The text content to chunk
 * @returns Array of Chunk objects with index, content, and estimated token count
 */
export function chunkContent(content: string): Chunk[] {
  const trimmed = content.trim();

  if (trimmed.length === 0) {
    return [];
  }

  const targetChars = tokensToChars(TARGET_CHUNK_TOKENS);
  const overlapChars = tokensToChars(OVERLAP_TOKENS);

  // If content fits in a single chunk, return as-is
  if (trimmed.length <= targetChars) {
    return [
      {
        index: 0,
        content: trimmed,
        tokens: estimateTokens(trimmed),
      },
    ];
  }

  // Step 1: Split on paragraph boundaries (double newlines)
  const paragraphs = splitByDelimiter(trimmed, "\n\n");

  // Step 2: Merge paragraphs into target-sized chunks
  const rawChunks = mergeSegmentsIntoChunks(paragraphs, targetChars);

  // Step 3: Apply overlap
  const overlappedChunks = applyOverlap(rawChunks, overlapChars);

  // Step 4: Build result with indices and token counts
  return overlappedChunks.map((content, index) => ({
    index,
    content: content.trim(),
    tokens: estimateTokens(content.trim()),
  }));
}
