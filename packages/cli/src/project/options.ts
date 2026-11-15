import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import type { NiscProject } from './project';

export type CommandOptions = {
  root: string;
  out?: string;
  allowLive?: boolean;
  port?: number;
  skipBundle?: boolean;
  dryRun?: boolean;
  status?: boolean;
  allowRemoval?: boolean;
  print?: (line: string) => void;
};

export const say = (options: CommandOptions): ((line: string) => void) => options.print ?? ((line) => console.log(line));

export const toolOf = (root: string, name: string, bin: string): string => {
  const require = createRequire(join(root, 'package.json'));
  let manifestPath: string;
  try {
    manifestPath = require.resolve(`${name}/package.json`);
  } catch {
    throw new Error(`nisc: this app has no ${name} installed (looked from ${root}).`);
  }
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const bins: unknown = manifest !== null && typeof manifest === 'object' ? Reflect.get(manifest, 'bin') : undefined;
  const relative: unknown = typeof bins === 'string' ? bins : bins !== null && typeof bins === 'object' ? Reflect.get(bins, bin) : undefined;
  if (typeof relative !== 'string') throw new Error(`nisc: ${name} ships no "${bin}" command.`);
  return join(dirname(manifestPath), relative);
};

export const distOf = (root: string, project: NiscProject): string => resolve(root, project.dist ?? 'dist');
