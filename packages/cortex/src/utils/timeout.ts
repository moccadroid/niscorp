// ═══════════════════════════════════════════════════════════
// Timeout utility — wraps a promise with a deadline
// ═══════════════════════════════════════════════════════════

export const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

export const withTimeout = <T>(
  promise: Promise<T> | T,
  timeoutMs: number,
  label: string,
): Promise<T> => {
  const resolved = Promise.resolve(promise);
  if (timeoutMs <= 0) return resolved;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    resolved.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
};
