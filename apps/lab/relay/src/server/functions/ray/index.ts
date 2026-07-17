// Ray — the Relay assistant. A Cortex standalone agent (Groq · openai/gpt-oss-120b)
// living INSIDE moss as the manifest's in-process functions: its tools drive the
// session's durable shell, its reads run under the caller's compiled scope
// policy, its keys come from the server's .env.
export { rayFunctions } from './run';
export { rayEngine, type RayEngine, type RayContext } from './engine';
