// Does `npm create nisc` make an app that WORKS — outside this workspace?
//
// The templates are workspace members, so CI typechecks, builds and checks them
// — linked to the packages next door. A new app gets none of that: it is the
// template copied somewhere else, depending on published packages, installed by
// a package manager that knows only its manifest. Two things were broken there
// and green here: the app's AGENTS.md pointed at a rulebook the app did not
// install, and nova crashed on import without a peer it called optional.
//
// So this makes each kind of app with the BUILT create-nisc, in a scratch
// folder outside the workspace, installs it from the packed tarballs with pnpm
// (strict: an import the manifest does not declare does not resolve), and holds
// it to what a new app promises:
//
//   the rulebook its AGENTS.md names is installed
//   it typechecks
//   its checks pass (`nisc check`)
//   it builds (`nisc build`) — and, with its own shell, exports its first
//   screen as a file with the app's name in it
//
// Run after `pnpm build`: `pnpm check:create`. Exits non-zero on any failure.

import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const packagesDir = join(root, 'packages');
const createNisc = join(packagesDir, 'create-nisc', 'bin', 'create-nisc.js');

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

// pnpm is pnpm.cmd on Windows, which execFileSync cannot spawn: there it goes
// through the shell as one string. Everywhere else, no shell.
const pnpm = (args: readonly string[], cwd: string): string =>
  process.platform === 'win32'
    ? execSync(['pnpm', ...args.map((arg) => `"${arg}"`)].join(' '), { cwd, stdio: 'pipe', encoding: 'utf8' })
    : execFileSync('pnpm', args, { cwd, stdio: 'pipe', encoding: 'utf8' });

const results: { label: string; ok: boolean; detail?: string }[] = [];
// What went wrong, in the failing command's own words when it had any.
const said = (error: unknown): string => {
  const output = isRecord(error) ? `${String(error['stdout'] ?? '')}${String(error['stderr'] ?? '')}`.trim() : '';
  const text = output !== '' ? output : error instanceof Error ? error.message : String(error);
  return text.split('\n').slice(-25).join('\n');
};
const step = (label: string, run: () => void): boolean => {
  try {
    run();
    results.push({ label, ok: true });
    return true;
  } catch (error) {
    results.push({ label, ok: false, detail: said(error) });
    return false;
  }
};

const KINDS = [
  { name: 'made-moss-react', flags: ['--moss', '--react'], ownShell: false },
  { name: 'made-moss-dom', flags: ['--moss', '--dom'], ownShell: false },
  { name: 'made-page-react', flags: ['--page', '--react'], ownShell: true },
  { name: 'made-page-dom', flags: ['--page', '--dom'], ownShell: true },
] as const;

const scratch = mkdtempSync(join(tmpdir(), 'nisc-create-'));
try {
  // Every published package, packed — `pnpm pack` is what turns `workspace:^`
  // into a real range. A new app is pointed at these instead of the registry.
  const tarballs: Record<string, string> = {};
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(packagesDir, entry.name);
    const manifest: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    if (!isRecord(manifest) || typeof manifest['name'] !== 'string' || !manifest['name'].startsWith('@niscorp/')) continue;
    const out = pnpm(['pack', '--pack-destination', scratch], dir);
    tarballs[manifest['name']] = `file:${out.trim().split('\n').at(-1) ?? ''}`;
  }

  for (const kind of KINDS) {
    const dir = join(scratch, kind.name);
    const made = step(`${kind.name}: created`, () => {
      execFileSync(process.execPath, [createNisc, kind.name, ...kind.flags], { cwd: scratch, stdio: 'pipe', encoding: 'utf8' });
    });
    if (!made) continue;

    // Exactly the app as made, except where its @niscorp packages come from.
    const manifestPath = join(dir, 'package.json');
    const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (!isRecord(manifest)) throw new Error(`${kind.name}: package.json is not an object`);
    const declared = [...Object.keys(isRecord(manifest['dependencies']) ? manifest['dependencies'] : {}), ...Object.keys(isRecord(manifest['devDependencies']) ? manifest['devDependencies'] : {})];
    step(`${kind.name}: depends on nothing left over from the workspace`, () => {
      if (JSON.stringify(manifest).includes('workspace:')) throw new Error('a workspace: range survived');
      if (!declared.includes('@niscorp/nisc')) throw new Error('@niscorp/nisc is not a dependency — the rulebook AGENTS.md points at would not be installed');
    });
    writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, pnpm: { overrides: tarballs } }, null, 2)}\n`);

    if (!step(`${kind.name}: installs (pnpm, strict)`, () => void pnpm(['install', '--no-frozen-lockfile'], dir))) continue;

    step(`${kind.name}: the rulebook its AGENTS.md names is installed`, () => {
      const agents = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
      const named = agents.match(/node_modules\/@niscorp\/nisc\/AGENTS\.md/)?.[0];
      if (named === undefined) throw new Error('AGENTS.md does not say where the rules are');
      if (!existsSync(join(dir, named))) throw new Error(`${named} does not exist after install`);
      if (!existsSync(join(dir, 'node_modules/@niscorp/nisc/STYLE_GUIDE.md'))) throw new Error('STYLE_GUIDE.md is not beside it');
    });
    step(`${kind.name}: typechecks`, () => void pnpm(['run', 'typecheck'], dir));
    step(`${kind.name}: its checks pass`, () => void pnpm(['run', 'check'], dir));
    step(`${kind.name}: builds`, () => void pnpm(['run', 'build'], dir));
    if (kind.ownShell) {
      step(`${kind.name}: exports its first screen as a file`, () => {
        pnpm(['run', 'export', '--', '--skip-bundle'], dir);
        const html = readFileSync(join(dir, 'out', 'index.html'), 'utf8');
        if (!html.includes(`>${kind.name}<`)) throw new Error('out/index.html does not hold the drawn screen');
      });
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

let failed = 0;
for (const result of results) {
  console.log(`${result.ok ? '[pass]' : '[fail]'} ${result.label}`);
  if (!result.ok) {
    failed += 1;
    if (result.detail !== undefined) console.log(result.detail.replace(/^/gm, '       '));
  }
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed === 0 ? 0 : 1);
