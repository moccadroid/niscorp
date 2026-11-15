import { mkdirSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

// The command from its source, so a test never runs a dist built before the change it tests.
export const NISC: readonly string[] = ['--import', pathToFileURL(require.resolve('tsx')).href, join(import.meta.dirname, '..', 'src', 'command', 'index.ts')];

// A temporary app finds a package the way an app finds its own: in its node_modules.
export const linkPackage = (folder: string, name: string): void => {
  mkdirSync(join(folder, 'node_modules'), { recursive: true });
  symlinkSync(dirname(require.resolve(`${name}/package.json`)), join(folder, 'node_modules', name), 'junction');
};
