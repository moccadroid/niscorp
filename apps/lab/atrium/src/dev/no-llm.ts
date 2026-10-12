// Imported before boot loads .env: Node's loadEnvFile never overrides a
// variable that is already set. The port keeps the checks' own integrations
// service off the dev one on 8788.
process.env['GROQ_API_KEY'] = '';
process.env['OPENROUTER_API_KEY'] = '';
process.env['INTEGRATIONS_PORT'] = '8789';

export {};
