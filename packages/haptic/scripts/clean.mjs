import { rm } from 'node:fs/promises';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../dist', import.meta.url));
if (relative(root, output) !== 'dist')
  throw new Error('Refusing to clean outside the build directory');
await rm(output, { recursive: true, force: true });
