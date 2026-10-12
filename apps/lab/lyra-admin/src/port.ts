// Functions, not constants: a check sets the environment before boot.
export const adminPort = (): number => Number(process.env['LYRA_ADMIN_PORT'] ?? 5190);
export const lyraBase = (): string => process.env['LYRA_BASE'] ?? 'http://localhost:5180';

export const operatorKey = (): string => process.env['OPERATOR_KEY'] ?? '';
