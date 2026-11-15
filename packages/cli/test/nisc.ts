import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// The command from its source, so a test never runs a dist built before the change it tests.
export const NISC: readonly string[] = ['--import', pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href, join(import.meta.dirname, '..', 'src', 'cli.ts')];
