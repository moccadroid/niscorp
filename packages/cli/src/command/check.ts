import { spawn } from 'node:child_process';
import { loadProject, toolOf } from '../project';
import type { CommandOptions } from '../project';

const handOver = (options: CommandOptions, tool: string, args: readonly string[]): Promise<number> =>
  new Promise((done) => {
    const child = spawn(process.execPath, [tool, ...args], { cwd: options.root, stdio: 'inherit' });
    child.once('exit', (code) => done(code ?? 1));
  });

export const check = async (options: CommandOptions): Promise<number> => {
  const project = await loadProject(options.root);
  return handOver(options, toolOf(options.root, 'tsx', 'tsx'), [project.checks ?? 'src/dev/all-checks.ts']);
};
