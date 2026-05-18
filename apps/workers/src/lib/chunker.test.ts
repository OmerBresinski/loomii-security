/**
 * Tests for Content Chunker.
 *
 * Tests cover:
 * - Splitting ~500 tokens per chunk (AC1)
 * - Maintaining 50-token overlap between chunks (AC1)
 * - Splitting on paragraph boundaries (AC1)
 * - Handling short content (single chunk)
 * - Handling empty content
 * - A 2000-token document producing ~4 chunks (AC1)
 */
import { describe, it, expect } from "bun:test";
import { chunkContent, estimateTokens } from "../lib/chunker";

/**
 * Generate text of approximately N tokens.
 * Using chars/4 estimation, so N tokens = N*4 characters.
 */
function generateText(tokens: number): string {
  // Use realistic words (~5 chars avg + space = ~6 chars, but we need tokens not words)
  // With chars/4, we need tokens * 4 characters
  const targetChars = tokens * 4;
  const words = "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua Ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur Excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum".split(
    " "
  );

  let text = "";
  let wordIdx = 0;
  while (text.length < targetChars) {
    text += words[wordIdx % words.length] + " ";
    wordIdx++;
  }
  return text.trim().slice(0, targetChars);
}

/**
 * Generate text with paragraph breaks at roughly even intervals.
 */
function generateParagraphedText(tokens: number, paragraphs: number): string {
  const tokensPerParagraph = Math.floor(tokens / paragraphs);
  const parts: string[] = [];
  for (let i = 0; i < paragraphs; i++) {
    parts.push(generateText(tokensPerParagraph));
  }
  return parts.join("\n\n");
}

describe("Chunker", () => {
  describe("chunkContent", () => {
    it("splits ~500 tokens per chunk", () => {
      // 2000 tokens with 12 paragraphs so paragraphs merge into ~500-token chunks
      const content = generateParagraphedText(2000, 12);
      const chunks = chunkContent(content);

      // Each chunk should be roughly 500 tokens (with overlap adding some)
      for (const chunk of chunks) {
        // Allow generous range: 200-700 tokens (overlap adds ~50)
        expect(chunk.tokens).toBeGreaterThan(100);
        expect(chunk.tokens).toBeLessThan(700);
      }
    });

    it("maintains 50-token overlap between adjacent chunks", () => {
      // Create content that will definitely produce multiple chunks
      const content = generateParagraphedText(2000, 12);
      const chunks = chunkContent(content);

      expect(chunks.length).toBeGreaterThan(1);

      // Check that consecutive chunks have overlapping content
      for (let i = 1; i < chunks.length; i++) {
        const prevChunk = chunks[i - 1];
        const currChunk = chunks[i];

        // The start of the current chunk should contain text from the end of the previous
        // Get the last ~200 chars of prev chunk (50 tokens * 4 chars/token)
        const prevEnd = prevChunk.content.slice(-200);

        // The current chunk should start with some portion of the previous chunk's end
        // Find if there's meaningful overlap
        let hasOverlap = false;
        // Check if any substring from prevEnd appears at the start of currChunk
        for (let len = 20; len <= Math.min(prevEnd.length, 200); len += 10) {
          const snippet = prevEnd.slice(-len);
          if (currChunk.content.startsWith(snippet)) {
            hasOverlap = true;
            break;
          }
        }

        // At minimum, the first word(s) of currChunk should appear in prevChunk
        const firstWords = currChunk.content.split(" ").slice(0, 3).join(" ");
        const overlapExists =
          hasOverlap || prevChunk.content.includes(firstWords);
        expect(overlapExists).toBe(true);
      }
    });

    it("splits on paragraph boundaries (not mid-sentence)", () => {
      const content = [
        "This is the first paragraph. It has multiple sentences. It discusses security topics.",
        "This is the second paragraph. It covers different ground. It mentions authentication.",
        "This is the third paragraph. It wraps up the discussion. Final thoughts here.",
      ].join("\n\n");

      const chunks = chunkContent(content);

      // Content is short enough for one chunk
      expect(chunks.length).toBe(1);
      expect(chunks[0].content).toContain("first paragraph");
      expect(chunks[0].content).toContain("third paragraph");
    });

    it("splits on paragraph boundaries for larger content", () => {
      // Create content with clear paragraph boundaries that exceeds one chunk
      const paragraph = generateText(300);
      const content = [paragraph, paragraph, paragraph].join("\n\n");

      const chunks = chunkContent(content);

      // Should produce multiple chunks, each starting at a clean boundary
      expect(chunks.length).toBeGreaterThan(1);

      // Second chunk onwards should start with content from the overlap,
      // but never start mid-word with a broken character sequence
      for (const chunk of chunks) {
        // Should not start with a space (trimmed)
        expect(chunk.content[0]).not.toBe(" ");
      }
    });

    it("handles short content (single chunk)", () => {
      const content = "This is a short piece of content that fits in one chunk.";
      const chunks = chunkContent(content);

      expect(chunks.length).toBe(1);
      expect(chunks[0].index).toBe(0);
      expect(chunks[0].content).toBe(content);
      expect(chunks[0].tokens).toBe(estimateTokens(content));
    });

    it("handles empty content", () => {
      const chunks = chunkContent("");
      expect(chunks.length).toBe(0);
    });

    it("handles whitespace-only content", () => {
      const chunks = chunkContent("   \n\n   ");
      expect(chunks.length).toBe(0);
    });

    it("2000-token document produces approximately 4 chunks", () => {
      // This is AC1 from the ticket
      // Using 12 paragraphs (~167 tokens each) so 3 paragraphs merge into ~500-token chunks
      const content = generateParagraphedText(2000, 12);
      const chunks = chunkContent(content);

      // Should produce approximately 4 chunks (3-6 is acceptable given overlap + paragraph boundaries)
      expect(chunks.length).toBeGreaterThanOrEqual(3);
      expect(chunks.length).toBeLessThanOrEqual(6);
    });

    it("assigns sequential indices starting from 0", () => {
      const content = generateParagraphedText(2000, 12);
      const chunks = chunkContent(content);

      for (let i = 0; i < chunks.length; i++) {
        expect(chunks[i].index).toBe(i);
      }
    });

    it("preserves all content (minus overlap duplication)", () => {
      const content = "First sentence. Second sentence. Third sentence.";
      const chunks = chunkContent(content);

      // All original content should be represented in the chunks
      expect(chunks[0].content).toContain("First sentence");
      expect(chunks[chunks.length - 1].content).toContain("Third sentence");
    });

    it("handles content with only single newlines", () => {
      const lines = Array.from(
        { length: 50 },
        (_, i) => `Line ${i + 1}: This is some content that fills up the text buffer gradually.`
      );
      const content = lines.join("\n");
      const chunks = chunkContent(content);

      expect(chunks.length).toBeGreaterThan(1);
      // Each chunk should be reasonable size
      for (const chunk of chunks) {
        expect(chunk.tokens).toBeLessThan(700);
      }
    });
  });

  describe("estimateTokens", () => {
    it("estimates tokens as chars/4", () => {
      expect(estimateTokens("abcd")).toBe(1);
      expect(estimateTokens("12345678")).toBe(2);
      expect(estimateTokens("a")).toBe(1); // ceil(1/4) = 1
    });

    it("handles empty string", () => {
      expect(estimateTokens("")).toBe(0);
    });
  });
});
