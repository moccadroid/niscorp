// The check suite, by name — what `pnpm check` runs (./all-checks.ts), and
// what the talk counts when it says how many checks there are
// (server/census.ts).
export const CHECKS: readonly string[] = [
  'artifacts-check',
  'kit-check',
  'tables-check',
  'deck-check',
  'serve-check',
  'access-check',
  'query-check',
  'timer-check',
  'assistant-check',
  'look-check',
  'xray-check',
  'button-check',
  'door-check',
  'integration-check',
  'questions-check',
  'ssh-check',
];
