import { createRequire } from 'node:module';
import { join } from 'node:path';
import type * as TS from 'typescript';

export type TypeScript = typeof TS;

const isTypeScript = (value: unknown): value is TypeScript =>
  value !== null && typeof value === 'object' && typeof Reflect.get(value, 'createProgram') === 'function' && typeof Reflect.get(value, 'version') === 'string';

// The app's own compiler, as `nisc build` uses the app's own jsdom: the gate adds no dependency to the cli.
export const loadTypeScript = (root: string): TypeScript => {
  const require = createRequire(join(root, 'package.json'));
  let library: unknown;
  try {
    library = require('typescript');
  } catch {
    throw new Error(`the shape check reads the source with TypeScript, and this app has none installed (looked from ${root}). pnpm add -D typescript`);
  }
  if (!isTypeScript(library)) throw new Error('the "typescript" this app has installed is not the TypeScript compiler.');
  if (!library.version.startsWith('6.')) throw new Error(`the shape check is written against TypeScript 6, and this app has ${library.version}.`);
  return library;
};
