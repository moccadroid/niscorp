import type { VexScenario } from './scenarios';

// Builds the teaching snippet shown in the chrome Source tab: how a
// caller would issue this exact request against a wired engine.
export const buildSource = (s: VexScenario): string => {
  const json = (v: unknown): string => JSON.stringify(v, null, 2).replace(/\n/g, '\n  ');

  if (s.mode === 'compile') {
    return [
      "import { createQueryEngine } from '@niscorp/vex';",
      '',
      '// The analyzer runs inside compile() — before any SQL exists.',
      '// This DSL is rejected, so compile() throws VexError(invalid_dsl).',
      `const dsl = ${json(s.dsl)};`,
      '',
      'engine.compile(dsl); // ✗ cartesian product: no join between entities',
    ].join('\n');
  }

  const hasScope = s.scopeKey !== undefined;
  const opts = hasScope ? `, {\n  scope: ${json(s.scope ?? {})},\n}` : '';
  const ctx = s.context !== undefined ? `\n  context: ${json(s.context)},` : '';

  return [
    "import { createQueryEngine, createPostgresAdapter } from '@niscorp/vex';",
    '',
    '// engine = createQueryEngine({ adapter, scope, generateDsl, mapToShape })',
    '// First request for a shape generates + caches the DSL; later',
    '// requests with the same shape skip the LLM entirely.',
    '',
    'const res = await engine.execute({',
    `  intent: ${JSON.stringify(s.intent)},`,
    `  shape: ${json(s.shape)},${ctx}`,
    `}${opts});`,
    '',
    '// res.result        → rows in the requested shape',
    '// res.meta.cache    → { hit, key }   (shape-keyed)',
    '// res.meta.timing   → per-stage timing',
  ].join('\n');
};
