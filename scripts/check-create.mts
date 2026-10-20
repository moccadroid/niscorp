import { execFileSync, execSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

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

const stepAsync = async (label: string, run: () => Promise<void>): Promise<boolean> => {
  try {
    await run();
    results.push({ label, ok: true });
    return true;
  } catch (error) {
    results.push({ label, ok: false, detail: said(error) });
    return false;
  }
};

const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));
const freePort = (): Promise<number> =>
  new Promise((done, fail) => {
    const probe = createServer();
    probe.once('error', fail);
    probe.listen(0, () => {
      const address = probe.address();
      const port = address !== null && typeof address === 'object' ? address.port : 0;
      probe.close(() => done(port));
    });
  });

// `nisc start` or `nisc dev` in the made app, for as long as `ask` runs; `log` is what it has said so far.
const whileRunning = async (dir: string, command: 'start' | 'dev', ask: (base: string, log: () => string) => Promise<void>): Promise<void> => {
  const port = await freePort();
  // vite listens on localhost, which may be ::1 rather than 127.0.0.1
  const base = command === 'dev' ? `http://localhost:${port}` : `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [join(dir, 'node_modules', '@niscorp', 'cli', 'bin', 'nisc.js'), command, '--port', String(port)], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (chunk: Buffer) => (log += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (log += chunk.toString()));
  try {
    const deadline = Date.now() + 60_000;
    for (;;) {
      try {
        if ((await fetch(`${base}/`)).ok) break;
      } catch {}
      if (Date.now() > deadline) throw new Error(`nisc ${command} did not come up:\n${log}`);
      await pause(200);
    }
    await ask(base, () => log);
  } finally {
    child.kill('SIGTERM');
  }
};

const KINDS = [
  { name: 'made-moss-react', flags: ['--moss', '--react'], ownShell: false, dev: true },
  { name: 'made-moss-dom', flags: ['--moss', '--dom'], ownShell: false, dev: false },
  { name: 'made-page-react', flags: ['--page', '--react'], ownShell: true, dev: false },
  { name: 'made-page-dom', flags: ['--page', '--dom'], ownShell: true, dev: false },
  { name: 'made-model-react', flags: ['--model-first', '--react'], ownShell: false, dev: false },
  { name: 'made-model-dom', flags: ['--model-first', '--dom'], ownShell: false, dev: false },
] as const;

const scratch = mkdtempSync(join(tmpdir(), 'nisc-create-'));
try {
  // `pnpm pack` is what turns `workspace:^` into a real range.
  const tarballs: Record<string, string> = {};
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(packagesDir, entry.name);
    const manifest: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    if (!isRecord(manifest) || typeof manifest['name'] !== 'string' || !manifest['name'].startsWith('@niscorp/')) continue;
    const out = pnpm(['pack', '--pack-destination', scratch], dir);
    tarballs[manifest['name']] = `file:${out.trim().split('\n').at(-1) ?? ''}`;
  }

  step('create-nisc: its package holds the templates and nothing built or local', () => {
    const out = pnpm(['pack', '--pack-destination', scratch], join(packagesDir, 'create-nisc'));
    const tarball = out.trim().split('\n').at(-1) ?? '';
    // By name, from its own folder: GNU tar (Git Bash) reads `C:\…` as a remote
    // host. And Windows' tar ends its lines CRLF.
    const entries = execFileSync('tar', ['-tzf', basename(tarball)], { cwd: dirname(tarball), encoding: 'utf8' }).trim().split(/\r?\n/);
    const stray = entries.filter((entry) => /^package\/templates\/.*\/(node_modules|dist|out|\.turbo)\//.test(entry));
    if (stray.length > 0) throw new Error(`in the tarball, and should not be:\n${stray.slice(0, 12).join('\n')}`);
    const templates = join(packagesDir, 'create-nisc', 'templates');
    const items = readdirSync(templates, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    for (const file of ['package/templates/questions.json', ...items.map((item) => `package/templates/${item}/item.json`)]) {
      if (!entries.includes(file)) throw new Error(`${file} is not in the tarball`);
    }
  });

  for (const kind of KINDS) {
    const dir = join(scratch, kind.name);
    const made = step(`${kind.name}: created`, () => {
      execFileSync(process.execPath, [createNisc, kind.name, ...kind.flags], { cwd: scratch, stdio: 'pipe', encoding: 'utf8' });
    });
    if (!made) continue;

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
    if (kind.dev) {
      await stepAsync(`${kind.name}: \`nisc dev\` draws the first screen in a vite page, hands moss's paths to the app server and the rest to vite, and re-boots the server when the source changes`, () =>
        whileRunning(dir, 'dev', async (base, log) => {
          const html = await (await fetch(`${base}/`)).text();
          for (const part of ['class="k-heading"', 'id="nisc-snapshot"', '/@vite/client']) if (!html.includes(part)) throw new Error(`the page has no ${part}`);
          if (!JSON.stringify(await (await fetch(`${base}/catalog`)).json()).includes('welcome')) throw new Error('/catalog is not the app server’s, or has no welcome');
          const entry = await fetch(`${base}/src/main.tsx`);
          if (!entry.ok || !(await entry.text()).includes('createTerminal')) throw new Error('vite does not serve src/main.tsx');
          const file = join(dir, 'src', 'app', 'charter', 'assignments.ts');
          writeFileSync(file, `${readFileSync(file, 'utf8')}\n`);
          const deadline = Date.now() + 30_000;
          while (!log().includes('app server re-booted')) {
            if (Date.now() > deadline) throw new Error(`the app server did not re-boot:\n${log()}`);
            await pause(150);
          }
          if (!(await fetch(`${base}/catalog`)).ok) throw new Error('the re-booted app server does not answer');
        }),
      );
    }
    const built = step(`${kind.name}: builds`, () => void pnpm(['run', 'build'], dir));
    if (!built) continue;
    step(`${kind.name}: the page it built holds its stylesheet`, () => {
      const html = readFileSync(join(dir, 'dist', 'index.html'), 'utf8');
      if (!html.includes('<style>')) throw new Error('dist/index.html has no <style>');
      if (/<link[^>]*rel="stylesheet"/.test(html)) throw new Error('dist/index.html still links a stylesheet as a file');
    });
    await stepAsync(`${kind.name}: \`nisc start\` serves what it built — compressed, the script kept, a missing file a 404`, () =>
      whileRunning(dir, 'start', async (base) => {
        const browser = { 'accept-encoding': 'br' };
        const page = await fetch(`${base}/`, { headers: browser });
        const html = await page.text();
        if (page.headers.get('content-encoding') !== 'br') throw new Error(`the page was not compressed (content-encoding: ${page.headers.get('content-encoding')})`);
        if (!html.includes('<style>') || html.includes('<div id="root"></div>')) throw new Error('the page is not the built page with its screen drawn');
        const script = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
        if (script === undefined) throw new Error('the page names no script under /assets/');
        const asset = await fetch(`${base}${script}`, { headers: browser });
        await asset.arrayBuffer();
        if (asset.headers.get('cache-control') !== 'public, max-age=31536000, immutable') throw new Error(`${script} is not kept (cache-control: ${asset.headers.get('cache-control')})`);
        if (asset.headers.get('content-encoding') !== 'br') throw new Error(`${script} was not compressed`);
        const missing = await fetch(`${base}/assets/index-GONE0000.js`, { headers: browser });
        await missing.arrayBuffer();
        if (missing.status !== 404) throw new Error(`a file that is not there was answered ${missing.status} ${missing.headers.get('content-type')}`);
      }),
    );
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
