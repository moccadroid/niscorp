// The ONE seam for where the integrations service lives. The service listens
// on it, the seed writes it into every connectors.service_url row, and the
// listener prints it — so the whole world agrees by construction.
//
// Read LAZILY (functions, not constants): the checks' world sets
// INTEGRATIONS_PORT before boot, and import evaluation order must not be able
// to freeze the default in first.
export const integrationsPort = (): number => Number(process.env['INTEGRATIONS_PORT'] ?? 8788);

export const integrationsBase = (): string => `http://127.0.0.1:${integrationsPort()}`;
