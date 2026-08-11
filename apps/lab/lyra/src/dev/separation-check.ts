// THE INTEGRATIONS SERVICE SHARES NO CODE WITH THIS APP.
//
// That is the rule the whole integration design rests on. An integration is a
// separate service on a separate machine with its own storage; the moment it
// can `import { membersList } from '@lyra/...'` none of that is true any more,
// and it stops being an integration and becomes a badly organised part of Lyra.
//
// It is also the rule that will be broken first, by somebody who needs one
// constant in a hurry and means to tidy it up later. So it is a check.
//
// What it MAY depend on is `@niscorp/*` — nova for the shape of an action, and
// nothing else. That is a protocol library, the same way you would depend on a
// wire format. Everything it knows about Lyra came over HTTP from
// `GET /api/integrations/contract`.
//
// Run: pnpm --filter lyra exec tsx src/dev/separation-check.ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ok, report } from './world';

const ROOT = '../lyra-integrations';

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith('.ts') ? [path] : [];
  });

const files = walk(join(ROOT, 'src')).map((path) => ({ path: path.replace(/\\/g, '/'), text: readFileSync(path, 'utf8') }));
ok('the integrations service exists and has source', files.length > 0, `${files.length} files`);

// ── no Lyra ──────────────────────────────────────────────────
const IMPORT = /(?:^|\n)\s*import[^;]*?from\s+['"]([^'"]+)['"]/g;
const RELATIVE_ESCAPE = /(?:^|\n)\s*import[^;]*?from\s+['"](\.\.\/\.\.\/[^'"]+)['"]/g;

const offenders: string[] = [];
const escapes: string[] = [];
for (const file of files) {
  for (const match of file.text.matchAll(IMPORT)) {
    const spec = match[1] ?? '';
    if (spec.startsWith('@lyra/')) offenders.push(`${file.path}: ${spec}`);
  }
  for (const match of file.text.matchAll(RELATIVE_ESCAPE)) escapes.push(`${file.path}: ${match[1]}`);
}

ok('it imports nothing from Lyra', offenders.length === 0, offenders.join(', ') || `${files.length} files clean`);
ok('...and does not climb out of its own tree', escapes.length === 0, escapes.join(', ') || 'no ../../ imports');

// ── and depends only on the protocol ─────────────────────────
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
const deps = Object.keys(manifest.dependencies ?? {});
const nisc = deps.filter((d) => d.startsWith('@niscorp/'));
ok('its declared dependencies name no Lyra package', !deps.some((d) => d.includes('lyra')), deps.join(', '));
ok('...and the platform ones are protocol libraries', nisc.every((d) => d === '@niscorp/nova' || d === '@niscorp/vex'), nisc.join(', ') || '(none)');

// FALSIFIABLE. The two assertions above pass trivially if the pattern matches
// nothing, so prove it fires on the shape it is meant to catch.
const BAD = "import { membersList } from '@lyra/app/vex/member.entries';";
ok('...and the rule catches an import that should not exist', [...BAD.matchAll(IMPORT)].some((m) => (m[1] ?? '').startsWith('@lyra/')));

// ── the other direction ──────────────────────────────────────
//
// Lyra must not reach into the integration either — except the one check that
// starts it, which needs a handle on the process and is named here so the
// exception is visible rather than assumed.
const lyraFiles = walk('src').map((path) => ({ path: path.replace(/\\/g, '/'), text: readFileSync(path, 'utf8') }));
const reachingIn = lyraFiles
  // FOUR NAMED EXCEPTIONS, and naming them is the point: three checks that boot
  // the integrations service in process, and one that boots the admin tool. An unnamed
  // exception is a rule with a hole nobody is looking at.
  .filter((f) => !['src/dev/integrations-check.ts', 'src/dev/separation-check.ts', 'src/dev/admin-check.ts', 'src/dev/perimeter-check.ts'].some((named) => f.path.endsWith(named)))
  .filter((f) => f.text.includes('lyra-integrations') || f.text.includes('lyra-admin'))
  .map((f) => f.path);
ok('Lyra reaches into the other services only from named checks', reachingIn.length === 0, reachingIn.join(', ') || 'two checks that boot them, and nothing else');

report('two systems, one wire: neither can import the other.');
