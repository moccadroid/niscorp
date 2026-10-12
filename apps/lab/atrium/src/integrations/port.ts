// Functions, not constants: the checks set INTEGRATIONS_PORT before boot, and
// a constant would freeze the default at import.
export const integrationsPort = (): number => Number(process.env['INTEGRATIONS_PORT'] ?? 8788);

export const integrationsBase = (): string => `http://127.0.0.1:${integrationsPort()}`;
