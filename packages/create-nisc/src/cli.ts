import { existsSync, readdirSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { cancel, confirm, intro, isCancel, note, outro, password, select, text } from '@clack/prompts';
import { envOf, isChoice, itemsOf, offered, readCatalog } from './catalog';
import type { Catalog, EnvKey, Item, Question } from './catalog';
import { TEMPLATES, generate, validName } from './generate';
import { testedSet } from './set';

const DEFAULT_DIR = 'my-nisc-app';
const OWN_FLAGS = ['--yes', '--workspace', '--help', '-h'];

const answering = (catalog: Catalog, question: Question): Item[] => catalog.items.filter((item) => item.answers === question.id);

// Written from the templates, so a new kit, shell or kind of app is in it without a line here changing.
const usageOf = (catalog: Catalog): string => {
  const rows: [string, string][] = [
    ['dir', `where the app goes (default: ${DEFAULT_DIR}); its name is the folder's`],
    ...catalog.questions.flatMap((question) =>
      answering(catalog, question).map((item): [string, string] => {
        const needs = Object.values(item.requires ?? {}).map((id) => `--${id}`);
        return [`--${item.id}`, `${item.usage ?? item.label ?? item.id}${item.default === true ? ' — the default' : ''}${needs.length > 0 ? ` (with ${needs.join(', ')})` : ''}`];
      }),
    ),
    ['--yes', 'take the defaults for anything not given, and ask nothing'],
    ['--workspace', 'depend on the nisc packages of the workspace it is made in — for an app inside the nisc repository'],
  ];
  const width = Math.max(...rows.map(([flag]) => flag.length)) + 2;
  const choices = catalog.questions.map((question) => `[${answering(catalog, question).map((item) => `--${item.id}`).join(' | ')}]`).join(' ');
  return `npm create nisc [dir] ${choices} [--yes]\n\n${rows.map(([flag, what]) => `  ${flag.padEnd(width)}${what}`).join('\n')}`;
};

const answered = <T extends string | boolean>(value: T | symbol): T => {
  if (typeof value === 'symbol' || isCancel(value)) {
    cancel('Nothing was made.');
    process.exit(1);
  }
  return value;
};

const manager = (): string => {
  const agent = process.env['npm_config_user_agent'] ?? '';
  return ['pnpm', 'yarn', 'bun'].find((name) => agent.startsWith(name)) ?? 'npm';
};

const main = async (): Promise<void> => {
  const catalog = readCatalog(TEMPLATES);
  const usage = usageOf(catalog);
  const refuse = (message: string): never => {
    console.error(`create-nisc: ${message}\n\n${usage}`);
    process.exit(1);
  };

  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    return;
  }
  const flags = args.filter((arg) => arg.startsWith('-'));
  const positional = args.filter((arg) => !arg.startsWith('-'));
  const byFlag = new Map(catalog.items.filter((item) => item.answers !== undefined).map((item) => [`--${item.id}`, item]));
  const unknown = flags.filter((flag) => !OWN_FLAGS.includes(flag) && !byFlag.has(flag));
  if (unknown.length > 0) refuse(`unknown option ${unknown.join(', ')}`);
  if (positional.length > 1) refuse(`one folder at a time — got ${positional.join(', ')}`);

  const picks: Record<string, string> = {};
  for (const item of flags.flatMap((flag) => byFlag.get(flag) ?? [])) {
    const question = item.answers ?? '';
    const before = picks[question];
    if (before !== undefined && before !== item.id) refuse(`--${before} and --${item.id} are two different apps; pick one`);
    picks[question] = item.id;
  }
  for (const id of Object.values(picks)) {
    for (const [question, wanted] of Object.entries(byFlag.get(`--${id}`)?.requires ?? {})) {
      const other = picks[question];
      if (other !== undefined && other !== wanted) refuse(`--${id} needs --${wanted}, not --${other}`);
    }
  }

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

  for (const question of catalog.questions) {
    if (picks[question.id] !== undefined) continue;
    const choices = offered(catalog, question.id, picks);
    const preferred = choices.find((item) => item.default === true) ?? choices[0];
    if (preferred === undefined) refuse(`nothing can answer "${question.message}" beside ${Object.values(picks).map((id) => `--${id}`).join(' ')}`);
    picks[question.id] =
      ask && choices.length > 1
        ? answered<string>(
            await select<string>({
              message: question.message,
              options: choices.map((item) => ({ value: item.id, label: item.label ?? item.id, ...(item.hint !== undefined ? { hint: item.hint } : {}) })),
              initialValue: preferred?.id ?? '',
            }),
          )
        : (preferred?.id ?? '');
  }
  const items = itemsOf(catalog, picks);

  // A key is asked for masked, or read from the environment when there is no terminal to ask in — never a flag,
  // which would leave it in the shell's history.
  const env: Record<string, string> = {};
  const empty: string[] = [];
  const keyed = async (key: EnvKey): Promise<void> => {
    const value = ask
      ? answered<string>(await password({ message: `${key.message}${key.required === true ? '' : ' — optional'} · empty: fill it in .env later` }))
      : (process.env[key.name] ?? '');
    env[key.name] = value.trim();
    if (key.required === true && env[key.name] === '') empty.push(key.name);
  };
  for (const spec of envOf(items)) {
    if (!isChoice(spec)) {
      await keyed(spec);
      continue;
    }
    const value = ask
      ? answered<string>(
          await select<string>({
            message: spec.message,
            options: spec.options.map((option) => ({ value: option.value, label: option.label, ...(option.hint !== undefined ? { hint: option.hint } : {}) })),
            initialValue: spec.options[0]?.value ?? '',
          }),
        )
      : (process.env[spec.choose] ?? spec.options[0]?.value ?? '');
    env[spec.choose] = value;
    for (const key of spec.options.find((option) => option.value === value)?.keys ?? []) await keyed(key);
  }

  const made = generate({ dir, name, picks, env, versions: testedSet(), workspace: flags.includes('--workspace'), today: new Date().toISOString().slice(0, 10) });

  const run = manager();
  const where = relative(process.cwd(), dir) || '.';
  const next = [...(where === '.' ? [] : [`cd ${where}`]), `${run} install`, `${run} run dev`].join('\n');
  const left = [...made.kept.map((file) => `kept your ${file}`), ...made.extended.map((file) => `added to your ${file}`)];
  const what = items.flatMap((item) => item.summary ?? []).join(', ');
  const summary = `${name} — ${what} — ${made.files.length} files${left.length > 0 ? ` (${left.join('; ')})` : ''}`;
  const keys = empty.length > 0 ? ` .env needs ${empty.join(', ')} before it runs.` : '';
  const after = `Before building anything: PLAN.md — what is still open — and AGENTS.md.${keys}`;
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
