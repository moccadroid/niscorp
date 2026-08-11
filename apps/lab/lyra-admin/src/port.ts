// The seams for WHERE things live. Read lazily (functions, not constants) so a
// check can set the environment before boot and import order cannot freeze a
// default in first.

export const adminPort = (): number => Number(process.env['LYRA_ADMIN_PORT'] ?? 5190);
export const lyraBase = (): string => process.env['LYRA_BASE'] ?? 'http://localhost:5180';

// THE KEY, ON BOTH SIDES OF THE SEAM. Absent here and the tool has nothing to
// talk to; absent in Lyra and the seam does not exist. Neither end can tell an
// unset key from a wrong one, which is the point — a stranger who finds the
// path learns nothing from the answer.
export const operatorKey = (): string => process.env['OPERATOR_KEY'] ?? '';
