import { basename, relative, resolve } from 'node:path';
import { cancel, intro, isCancel, note, outro, select, text } from '@clack/prompts';
import { generate, validName } from './generate';
import type { Posture, Ui } from './generate';
import { releasedSet } from './versions';

// ═══════════════════════════════════════════════════════════════
// npm create nisc [dir] [--moss | --page] [--react | --dom] [--yes]
//
// Three questions — where the app goes, where its shell runs (D1), what draws
// the screen — because those are what shape the files. Everything else the
// rulebook's interview asks is written into the app's PLAN.md as open, for the
// conversation that comes next. A flag answers its question; `--yes` takes the
// defaults for the rest (moss, React); with no terminal to ask in, the flags
// are all there is.
// ═══════════════════════════════════════════════════════════════

const USAGE = `npm create nisc [dir] [--moss | --page] [--react | --dom] [--yes]

  --moss     the shell runs on a server (moss) — the default
  --page     the shell runs in the page, no server (offline, static hosting)
  --react    React draws the screen — the default
  --dom      plain DOM draws the screen, no framework in the page
  --yes      take the defaults for anything not given`;

// An answer, or the walkthrough was cancelled (Ctrl-C) and nothing is made.
const answered = <T extends string>(value: T | symbol): T => {
  if (typeof value === 'symbol' || isCancel(value)) {
    cancel('Nothing was made.');
    process.exit(1);
  }
  return value;
};

// The package manager this was run with, to say the next commands in its words.
const manager = (): string => {
  const agent = process.env['npm_config_user_agent'] ?? '';
  return ['pnpm', 'yarn', 'bun'].find((name) => agent.startsWith(name)) ?? 'npm';
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    return;
  }
  const ask = process.stdout.isTTY === true && process.stdin.isTTY === true && !args.includes('--yes');
  const given = args.find((arg) => !arg.startsWith('-'));

  if (ask) intro('a new nisc app');

  const dirInput =
    given ??
    (ask
      ? answered(
          await text({
            message: 'Where should it go?',
            placeholder: 'my-nisc-app',
            defaultValue: 'my-nisc-app',
            validate: (value) => (value !== undefined && !validName(basename(value === '' ? 'my-nisc-app' : value)) ? 'lowercase letters, digits, - . _' : undefined),
          }),
        )
      : 'my-nisc-app');
  const dir = resolve(dirInput === '' ? 'my-nisc-app' : dirInput);

  const posture: Posture = args.includes('--page')
    ? 'page'
    : args.includes('--moss') || !ask
      ? 'moss'
      : answered<Posture>(
          await select<Posture>({
            message: 'Where does the shell run?',
            options: [
              { value: 'moss', label: 'On a server — moss', hint: 'one shell per person on the server; charter enforced, data stays there, sign-in, AI features' },
              { value: 'page', label: 'In the page — no server', hint: 'offline, static hosting; the charter is not a security boundary' },
            ],
            initialValue: 'moss',
          }),
        );

  const ui: Ui = args.includes('--dom')
    ? 'dom'
    : args.includes('--react') || !ask
      ? 'react'
      : answered<Ui>(
          await select<Ui>({
            message: 'What draws the screen?',
            options: [
              { value: 'react', label: 'React' },
              { value: 'dom', label: 'Plain DOM', hint: 'no framework in the page' },
            ],
            initialValue: 'react',
          }),
        );

  const versions = await releasedSet(process.env['npm_config_registry'] ?? 'https://registry.npmjs.org');
  const files = generate({ dir, name: basename(dir), posture, ui, versions, today: new Date().toISOString().slice(0, 10) });

  const run = manager();
  const where = relative(process.cwd(), dir) || '.';
  const next = [...(where === '.' ? [] : [`cd ${where}`]), `${run} install`, `${run} run dev`].join('\n');
  if (ask) {
    note(next, 'Next');
    outro(`${files.length} files. Before building anything: PLAN.md — what is still open — and AGENTS.md.`);
  } else {
    console.log(`create-nisc: ${basename(dir)} — ${posture === 'moss' ? 'behind moss' : 'its own shell'}, ${ui === 'react' ? 'React' : 'plain DOM'} (${files.length} files)\n\n${next}\n\nBefore building anything: PLAN.md — what is still open — and AGENTS.md.`);
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
