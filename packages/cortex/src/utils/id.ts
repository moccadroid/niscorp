// ═══════════════════════════════════════════════════════════
// ID generation — workflow, correlation, run ids
// ═══════════════════════════════════════════════════════════
//
// crypto.randomUUID is available on Node >=18.18 (the package's
// engines target). No external dep needed.

const randomId = (): string => {
  // crypto.randomUUID() exists on the global in Node 18.18+ and modern browsers.
  // Fall back to a non-cryptographic id only if absent (testing in odd envs).
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Deterministic fallback: timestamp + counter. Not for production.
  return `id_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
};

export const newRunId = (): string => `run_${randomId()}`;
export const newApprovalId = (): string => `apr_${randomId()}`;
