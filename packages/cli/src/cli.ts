import { resolve } from 'node:path';
import { build, check, dev, exportSite, start } from './commands';
import type { CommandOptions } from './commands';

// ═══════════════════════════════════════════════════════════════
// nisc — the command line. It parses, and hands over to ./commands.
// ═══════════════════════════════════════════════════════════════

const USAGE = `nisc — the command for a nisc application

  nisc dev                 the app's dev server — its vite, with the app server inside
  nisc build               bundle the app, draw every path, and check what was drawn
  nisc export              build, then write every path as a file (the site as a folder)
  nisc start               serve the built app, each path's first screen drawn
  nisc check               the app's check suite

  --root <dir>             the app's root (default: here) — where nisc.config.ts is
  --out <dir>              export: where the files go (default: out)
  --allow-live             export: write even though some path wants a server behind it
  --port <n>               dev, start: the port (start: $PORT, then 8787)
  --skip-bundle            build, export: the terminal is already built

An app says in nisc.config.ts how it boots and how one of its screens is drawn.
Behind moss (boot + draw): which paths exist and what each needs is read off the
server. With its own shell (shell + draw + adopt): every path is drawn from the
app's own boot, and a file is written only if the page's boot picks it up clean.`;

const valueAfter = (args: readonly string[], flag: string): string | undefined => {
  const at = args.indexOf(flag);
  return at < 0 ? undefined : args[at + 1];
};

const main = async (): Promise<number> => {
  const [command, ...args] = process.argv.slice(2);
  const port = valueAfter(args, '--port');
  const out = valueAfter(args, '--out');
  const options: CommandOptions = {
    root: resolve(valueAfter(args, '--root') ?? process.cwd()),
    ...(out !== undefined ? { out } : {}),
    ...(port !== undefined ? { port: Number(port) } : {}),
    allowLive: args.includes('--allow-live'),
    skipBundle: args.includes('--skip-bundle'),
  };

  if (command === 'dev' || command === 'start') {
    const served = command === 'dev' ? await dev(options) : await start(options);
    const stop = (): void => {
      void served.close().finally(() => process.exit(0));
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    // stays up until it is told to stop
    return new Promise<number>(() => undefined);
  }
  if (command === 'check') return check(options);
  if (command === 'build') {
    return (await build(options)).ok ? 0 : 1;
  }
  if (command === 'export') return (await exportSite(options)).written ? 0 : 1;
  console.log(USAGE);
  return command === undefined || command === 'help' || command === '--help' ? 0 : 1;
};

main().then(
  // An app's own handles (a database, a timer) must not keep a finished command
  // open: a command that is done says so and leaves.
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
