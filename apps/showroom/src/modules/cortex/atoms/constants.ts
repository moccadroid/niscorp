// Shared provider + model defaults used by every cortex demo runner.
// Kept here so the RunButton badge, the log lines, and the actual
// provider wiring stay in sync.

export const PROVIDER = 'groq' as const;
export const DEFAULT_MODEL = 'openai/gpt-oss-120b';
