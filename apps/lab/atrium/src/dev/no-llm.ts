// Imported FIRST by the checks' world: makes the suite HERMETIC before boot
// loads .env (Node's loadEnvFile never overrides an existing variable).
//
//   keys    — blanked, so the deterministic suite exercises the whole
//             assistant surface with the agent honestly reporting "no key"
//             instead of reaching a network. The live pass (ai-check) imports
//             boot directly and keeps the real keys.
//   port    — the checks' world runs its OWN integrations service; the port
//             seam (integrations/port.ts) feeds both the listener and the
//             seeded service_url rows, so setting it here moves the whole
//             hermetic world off the dev environment's 8788. The
//             integrations-check "service down" phase stays honest even
//             while a dev integrations service is running.
process.env['GROQ_API_KEY'] = '';
process.env['OPENROUTER_API_KEY'] = '';
process.env['INTEGRATIONS_PORT'] = '8789';

export {};
