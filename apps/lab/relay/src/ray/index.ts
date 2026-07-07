// Ray — the Relay assistant. A Cortex standalone agent (Groq · openai/gpt-oss-120b)
// exposed to Nova as functions the chat surface calls. Its tools drive the same
// shell a human does; it reads the live screen + action catalog as context.
export { rayRun, raySetKey, rayLoad, rayNewSession, raySwitchSession, bindShell } from './run';
export { getDebug, setDebug } from './settings';
export { clearAll, storageEstimate } from './sessions';
