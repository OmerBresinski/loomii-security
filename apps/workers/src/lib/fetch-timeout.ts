/**
 * Utility for wrapping async functions with an AbortController-based timeout.
 */

export class FetchTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Fetch timed out after ${timeoutMs}ms`);
    this.name = "FetchTimeoutError";
  }
}

/**
 * Wraps an async function with a timeout using AbortController.
 * If the function takes longer than `timeoutMs`, it rejects with FetchTimeoutError.
 */
export async function fetchWithTimeout<T>(
  fn: (signal?: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await Promise.race([
      fn(controller.signal),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(new FetchTimeoutError(timeoutMs));
        });
      }),
    ]);
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}
