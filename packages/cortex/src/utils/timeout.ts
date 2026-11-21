export const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

export const withTimeout = async <T>(
  execute: (signal: AbortSignal) => Promise<T> | T,
  limit: { timeoutMs: number; label: string; run: AbortSignal },
): Promise<T> => {
  const call = new AbortController();
  // No reason, as the run's: a tool, or the fetch it started, tells an abort by its AbortError.
  const abort = (): void => call.abort();
  if (limit.run.aborted) abort();
  else limit.run.addEventListener('abort', abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${limit.label} timed out after ${limit.timeoutMs}ms`));
      abort();
    }, limit.timeoutMs);
  });
  try {
    return await Promise.race([execute(call.signal), timedOut]);
  } finally {
    clearTimeout(timer);
    limit.run.removeEventListener('abort', abort);
  }
};
