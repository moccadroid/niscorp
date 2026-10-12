const randomId = (): string => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `id_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
};

export const newRunId = (): string => `run_${randomId()}`;
export const newApprovalId = (): string => `apr_${randomId()}`;
