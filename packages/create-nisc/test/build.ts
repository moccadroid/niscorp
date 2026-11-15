import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

export const setup = (): void => {
  const tsup = join(dirname(require.resolve('tsup/package.json')), 'dist', 'cli-default.js');
  const built = spawnSync(process.execPath, [tsup], { cwd: join(import.meta.dirname, '..'), stdio: 'pipe', encoding: 'utf8' });
  if (built.status !== 0) throw new Error(`create-nisc: the build before the tests failed:\n${built.stdout}${built.stderr}`);
};
