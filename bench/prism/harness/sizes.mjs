// What each library adds to a bundle: one entry that imports what its adapter uses, bundled and minified by
// esbuild for the browser with everything it depends on, then gzipped. Writes results/sizes.json.

import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const prism = '../../../packages/prism/dist/index.js';

const ENTRIES = [
  { name: 'Prism: evaluate', code: `export { evaluate } from '${prism}';`, note: 'checks the config: includes zod' },
  { name: 'Prism: prismTransform', code: `export { prismTransform } from '${prism}';`, note: 'includes zod' },
  { name: 'Prism: execute only', code: `export { execute } from '${prism}';`, note: 'runs an IR compiled elsewhere' },
  { name: 'Prism: everything', code: `export * from '${prism}';`, note: 'includes zod' },
  { name: 'JSONata', code: `export { default } from 'jsonata';` },
  { name: 'JsonLogic (json-logic-js)', code: `export { default } from 'json-logic-js';` },
  { name: 'JsonLogic (json-logic-engine)', code: `export { LogicEngine } from 'json-logic-engine';` },
  { name: 'JSON Query', code: `export { jsonquery, compile, parse } from '@jsonquerylang/jsonquery';` },
  { name: 'JSON Query, JSON form only', code: `export { jsonquery, compile } from '@jsonquerylang/jsonquery';` },
  { name: 'mingo', code: `export { Aggregator } from 'mingo';`, note: 'the default entry, every operator' },
  { name: 'JMESPath (jmespath)', code: `export { search } from 'jmespath';` },
  { name: 'JMESPath (community)', code: `export * from '@jmespath-community/jmespath';` },
  { name: 'json-e', code: `export { default } from 'json-e';` },
  { name: 'GROQ (groq-js)', code: `export { parse, evaluate } from 'groq-js';` },
  { name: 'CEL (@marcbachmann/cel-js)', code: `export * from '@marcbachmann/cel-js';` },
  { name: 'jora', code: `export { default } from 'jora';` },
  { name: 'lodash', code: `export { default } from 'lodash';`, note: 'the whole of lodash, as `import _ from "lodash"` brings it' },
];

const out = [];
for (const entry of ENTRIES) {
  try {
    const result = await build({
      stdin: { contents: entry.code, resolveDir: join(root, 'harness'), loader: 'js' },
      bundle: true,
      minify: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      write: false,
      logLevel: 'silent',
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    const bytes = result.outputFiles[0].contents;
    out.push({ name: entry.name, minified: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length, note: entry.note });
  } catch (error) {
    out.push({ name: entry.name, minified: 0, gzip: 0, note: `did not bundle for the browser: ${String(error?.errors?.[0]?.text ?? error?.message).slice(0, 120)}` });
  }
}
mkdirSync(join(root, 'results'), { recursive: true });
writeFileSync(join(root, 'results', 'sizes.json'), JSON.stringify(out, null, 2));
for (const s of out) console.log(s.name.padEnd(34), `${(s.minified / 1024).toFixed(1).padStart(8)} kB`, `${(s.gzip / 1024).toFixed(1).padStart(7)} kB gzip`, s.note ?? '');
