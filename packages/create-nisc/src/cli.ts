import { existsSync, readdirSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { cancel, confirm, intro, isCancel, note, outro, select, text } from '@clack/prompts';
import { generate, validName } from './generate';
import type { Posture, Ui } from './generate';
import { testedSet } from './set';

// ═══════════════════════════════════════════════════════════════
// npm create nisc [dir] [--moss | --page] [--react | --dom] [--yes]
//
// Three questions — where the app goes, where its shell runs (D1), what draws
// the screen — because those are what shape the files. Everything else the
// rulebook's interview asks is written into the app's PLAN.md as open, for the
// conversation that comes next. A flag answers its question; `--yes` takes the
// defaults for the rest (moss, React); with no terminal to ask in, the flags
// are all there is. A flag it does not know is an error, never ignored: a typo
// must not quietly make a different app.
// ═══════════════════════════════════════════════════════════════

const USAGE = `npm create nisc [dir] [--moss | --page] [--react | --dom] [--yes]

  dir        where the app goes (default: my-nisc-app); its name is the folder's
  --moss     the shell runs on a server (moss) — the default
  --page     the shell runs in the page, no server (offline, static hosting)
  --react    React draws the screen — the default
  --dom      plain DOM draws the screen, no framework in the page
  --yes      take the defaults for anything not given, and ask nothing`;

const FLAGS = new Set(['--moss', '--page', '--react', '--dom', '--yes', '--help', '-h']);
const DEFAULT_DIR = 'my-nisc-app';

const refuse = (message: string): never => {
  console.error(`create-nisc: ${message}\n\n${USAGE}`);
  process.exit(1);
};

// An answer, or the walkthrough was cancelled (Ctrl-C) and nothing is made.
const answered = <T extends string | boolean>(value: T | symbol): T => {
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
  const flags = args.filter((arg) => arg.startsWith('-'));
  const positional = args.filter((arg) => !arg.startsWith('-'));
  const unknown = flags.filter((flag) => !FLAGS.has(flag));
  if (unknown.length > 0) refuse(`unknown option ${unknown.join(', ')}`);
  if (positional.length > 1) refuse(`one folder at a time — got ${positional.join(', ')}`);
  if (flags.includes('--moss') && flags.includes('--page')) refuse('--moss and --page are two different apps; pick one');
  if (flags.includes('--react') && flags.includes('--dom')) refuse('--react and --dom are two different kits; pick one');

  const ask = process.stdout.isTTY === true && process.stdin.isTTY === true && !flags.includes('--yes');
  if (ask) intro('a new nisc app');

  const given = positional[0];
  const dirInput =
    given ??
    (ask
      ? answered<string>(
          await text({
            message: 'Where should it go?',
            placeholder: DEFAULT_DIR,
            defaultValue: DEFAULT_DIR,
            validate: (value) =>
              validName(basename(resolve(value === undefined || value === '' ? DEFAULT_DIR : value))) ? undefined : 'the folder’s name becomes the package name: lowercase letters, digits, - . _',
          }),
        )
      : DEFAULT_DIR);
  const dir = resolve(dirInput === '' ? DEFAULT_DIR : dirInput);
  const name = basename(dir);
  if (!validName(name)) refuse(`"${name}" cannot be a package name — the folder’s name becomes it: lowercase letters, digits, - . _`);

  // A folder that already holds something: nothing in it is overwritten (the
  // generator refuses if anything would be), but making an app in the wrong
  // place is worth one question.
  const holds = existsSync(dir) ? readdirSync(dir).length : 0;
  if (holds > 0 && ask) {
    const proceed = answered<boolean>(
      await confirm({ message: `${relative(process.cwd(), dir) || '.'} already holds ${holds} ${holds === 1 ? 'thing' : 'things'}. Nothing there will be overwritten — make the app in it?`, initialValue: true }),
    );
    if (!proceed) {
      cancel('Nothing was made.');
      process.exit(1);
    }
  }

  const posture: Posture = flags.includes('--page')
    ? 'page'
    : flags.includes('--moss') || !ask
      ? 'moss'
      : answered<Posture>(
          await select<Posture>({
            message: 'Where does the shell run?',
            options: [
              { value: 'moss', label: 'On a server — moss', hint: 'one shell per person on the server; the charter is enforced there' },
              { value: 'page', label: 'In the page — no server', hint: 'offline, static hosting; the charter is not a security boundary' },
            ],
            initialValue: 'moss',
          }),
        );

  const ui: Ui = flags.includes('--dom')
    ? 'dom'
    : flags.includes('--react') || !ask
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

  const made = generate({ dir, name, posture, ui, versions: testedSet(), today: new Date().toISOString().slice(0, 10) });

  const run = manager();
  const where = relative(process.cwd(), dir) || '.';
  const next = [...(where === '.' ? [] : [`cd ${where}`]), `${run} install`, `${run} run dev`].join('\n');
  const left = [...made.kept.map((file) => `kept your ${file}`), ...made.extended.map((file) => `added to your ${file}`)];
  const summary = `${name} — ${posture === 'moss' ? 'behind moss' : 'its own shell'}, ${ui === 'react' ? 'React' : 'plain DOM'} — ${made.files.length} files${left.length > 0 ? ` (${left.join('; ')})` : ''}`;
  const after = 'Before building anything: PLAN.md — what is still open — and AGENTS.md.';
  if (ask) {
    note(next, 'Next');
    outro(`${summary}. ${after}`);
  } else {
    console.log(`create-nisc: ${summary}\n\n${next}\n\n${after}`);
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
