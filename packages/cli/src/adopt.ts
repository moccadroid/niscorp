import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { format } from 'node:util';
import { shellSettled } from '@niscorp/nova';

const QUIET_MS = 60;
const ADOPT_WAIT_MS = 10_000;

const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

const standDom = (root: string): void => {
  const require = createRequire(join(root, 'package.json'));
  let library: unknown;
  try {
    library = require('jsdom');
  } catch {
    throw new Error(`nisc: the adoption check needs a DOM, and this app has no jsdom installed (looked from ${root}). pnpm add -D jsdom`);
  }
  const constructor: unknown = library !== null && typeof library === 'object' ? Reflect.get(library, 'JSDOM') : undefined;
  if (typeof constructor !== 'function') throw new Error('nisc: jsdom exports no JSDOM.');
  const dom: unknown = Reflect.construct(constructor, ['<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true }]);
  const window: unknown = dom !== null && typeof dom === 'object' ? Reflect.get(dom, 'window') : undefined;
  if (window === null || typeof window !== 'object') throw new Error('nisc: jsdom made no window.');
  for (const name of ['window', 'document', ...Object.getOwnPropertyNames(window)]) {
    if (name in globalThis) continue;
    Object.defineProperty(globalThis, name, { configurable: true, get: () => Reflect.get(window, name) });
  }
};

const main = async (): Promise<void> => {
  const [root, asked, answered] = process.argv.slice(2);
  if (root === undefined || asked === undefined || answered === undefined) throw new Error('usage: adopt <root> <pages.json> <answer.json>');
  standDom(root);
  // only now: the app's modules load into a world that has a DOM
  const { isShellProject, loadProject } = await import('./project');
  const project = await loadProject(root);
  if (!isShellProject(project)) throw new Error('nisc: this app has no shell of its own to adopt with.');

  const pages: unknown = JSON.parse(readFileSync(asked, 'utf8'));
  if (!Array.isArray(pages)) throw new Error('nisc: no pages to adopt.');

  let complaints: string[] = [];
  const short = (text: string): string => (text.length > 600 ? `${text.slice(0, 600)}…` : text);
  console.error = (...args: unknown[]): void => {
    complaints.push(short(format(...args)));
  };
  window.addEventListener('error', (event) => {
    complaints.push(short(event.message));
    event.preventDefault();
  });

  const out: { path: string; complaints: string[] }[] = [];
  for (const page of pages) {
    const path: unknown = page !== null && typeof page === 'object' ? Reflect.get(page, 'path') : undefined;
    const screen: unknown = page !== null && typeof page === 'object' ? Reflect.get(page, 'screen') : undefined;
    if (typeof path !== 'string' || typeof screen !== 'string') continue;
    complaints = [];
    const mine = complaints;
    try {
      document.body.innerHTML = '<div id="root"></div>';
      const element = document.getElementById('root');
      if (element === null) throw new Error('no root');
      element.innerHTML = screen;
      const parsed = element.innerHTML;
      const booted = await project.shell({ path });
      if (!(await shellSettled(booted.shell, { waitMs: ADOPT_WAIT_MS }))) mine.push('the page’s own boot was still loading when it came to adopt');
      await project.adopt(element, booted.shell);
      // An adapter that rebuilds its root (the DOM adapter) has done so by now.
      // One that adopts in place (React, Vue) reports a mismatch a moment
      // later, as a logged or raised error: the pause waits for it.
      if (element.innerHTML !== parsed) mine.push('what the page’s boot drew is not the markup it was handed');
      await pause(QUIET_MS);
      await booted.close?.();
    } catch (error) {
      mine.push(error instanceof Error ? error.message : String(error));
    }
    out.push({ path, complaints: mine });
  }
  writeFileSync(answered, JSON.stringify(out));
};

main().then(
  () => process.exit(0),
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  },
);
