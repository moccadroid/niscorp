// The models a person may choose between — what the settings picker shows and
// what `staff.assistant_model` may hold. Data, so it lives with the artifacts:
// the picker reads it here, and the server (server/assistant/profiles.ts) reads
// the same table to learn what a chosen key means. One list, so a key the
// server cannot spend can never appear on screen.

export type ModelChoice = { provider: string; model: string; title: string; blurb: string };

export const MODELS: Record<string, ModelChoice> = {
  '': { provider: '', model: '', title: 'House default', blurb: 'Whatever this assistant is configured to run on.' },
  'glm-5.2': { provider: 'openrouter', model: 'z-ai/glm-5.2', title: 'GLM 5.2', blurb: 'Through OpenRouter. Slower, and reads a situation better.' },
  'qwen-27b': { provider: 'groq', model: 'qwen/qwen3.8-27b', title: 'Qwen 3.8 27B', blurb: 'Through Groq. The house model: fast enough to feel ambient.' },
  'gpt-oss-120b': { provider: 'groq', model: 'openai/gpt-oss-120b', title: 'gpt-oss 120b', blurb: 'Through Groq. Fast enough to feel ambient.' },
};
