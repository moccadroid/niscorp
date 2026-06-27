// Ray — the Relay assistant. A Cortex standalone agent (Groq · openai/gpt-oss-120b)
// exposed to Nova as two functions the chat surface calls. Its tools drive the
// same shell a human does; it reads the live screen + action catalog as context.
export { rayRun, raySetKey, rayLoad, rayNewSession, raySwitchSession } from './run';
export { bindShell } from './bridge';
export { makeTools } from './tools';
export { buildContext } from './context';
export { rayAgent } from './agent';
