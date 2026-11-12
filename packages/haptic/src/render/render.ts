import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export type RenderOptions = { waitMs?: number; capMs?: number };
export type CapturedSource = {
  url: string;
  status: number;
  headers: Record<string, string[]>;
  encoded?: unknown;
  body: { base64: string; bytes: number; sha256: string };
};

const WAIT_MS = 600;
const CAP_MS = 15_000;

// The built child; when this module runs from source (tests), the built copy in the package's dist.
const childScript = (): string => {
  const candidates = [
    new URL('./child.mjs', import.meta.url),
    new URL('../../dist/render/child.mjs', import.meta.url),
  ];
  const found = candidates.find((url) => existsSync(fileURLToPath(url)));
  if (!found) throw new Error('render child not built: run the package build');
  return fileURLToPath(found);
};

// jsdom's entry file, and the folder holding it and its dependencies (pnpm's store, or the node_modules it sits in).
const jsdomFiles = (): { entry: string; folder: string } => {
  const entry = realpathSync(createRequire(import.meta.url).resolve('jsdom'));
  const pnpm = entry.indexOf(`${sep}.pnpm${sep}`);
  if (pnpm >= 0) return { entry, folder: entry.slice(0, pnpm + `${sep}.pnpm`.length) };
  const modules = entry.lastIndexOf(`${sep}node_modules${sep}`);
  return {
    entry,
    folder: modules >= 0 ? entry.slice(0, modules + `${sep}node_modules`.length) : dirname(entry),
  };
};

// The page as its own inline scripts leave it. Runs in a child process: Node's permission model (it reads only its
// own folder and jsdom's, so not the package folder with its .env; no writes, no child processes), an empty
// environment, no external files, killed at the cap.
export const renderHtml = (
  html: string,
  url: string,
  options: RenderOptions = {},
): Promise<string> => {
  const script = childScript();
  const jsdom = jsdomFiles();
  const waitMs = options.waitMs ?? WAIT_MS;
  const args = [
    '--permission',
    `--allow-fs-read=${dirname(script)}`,
    `--allow-fs-read=${jsdom.folder}`,
    script,
    pathToFileURL(jsdom.entry).href,
  ];
  const env =
    process.platform === 'win32' && process.env.SystemRoot
      ? { SystemRoot: process.env.SystemRoot }
      : {};
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const timer = setTimeout(() => child.kill('SIGKILL'), options.capMs ?? CAP_MS);
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(out).toString('utf8'));
      else
        reject(
          new Error(
            `rendering failed (${code ?? 'killed'}): ${Buffer.concat(err).toString('utf8').slice(0, 300)}`,
          ),
        );
    });
    child.stdin.end(JSON.stringify({ html, url, waitMs }));
  });
};

// A source whose body is the rendered page. A page that cannot be rendered is returned as it was fetched.
export const renderSource = async <S extends CapturedSource>(
  source: S,
  options: RenderOptions = {},
): Promise<S> => {
  const html = Buffer.from(source.body.base64, 'base64').toString('utf8');
  let rendered: string;
  try {
    rendered = await renderHtml(html, source.url, options);
  } catch {
    return source;
  }
  const bytes = Buffer.from(rendered, 'utf8');
  return {
    ...source,
    body: {
      base64: bytes.toString('base64'),
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
  };
};
