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

// WHERE IT LANDS, not how many dots it has. This counted `../../` and called it
// an escape, which was true while the service was one flat directory and became
// false the moment packs nested: `packs/belts/index.ts` importing `../../pack`
// is reaching for the contract one floor up, inside its own tree. Resolving the
// specifier says so; counting dots accuses it.
const SRC_ROOT = join(ROOT, 'src').replace(/\\/g, '/');
const landsOutside = (from: string, spec: string): boolean =>
  spec.startsWith('.') && !join(from, '..', spec).replace(/\\/g, '/').startsWith(`${SRC_ROOT}/`);

const offenders: string[] = [];
const escapes: string[] = [];
for (const file of files) {
  for (const match of file.text.matchAll(IMPORT)) {
    const spec = match[1] ?? '';
    if (spec.startsWith('@lyra/')) offenders.push(`${file.path}: ${spec}`);
    if (landsOutside(file.path, spec)) escapes.push(`${file.path}: ${spec}`);
  }
}

ok('it imports nothing from Lyra', offenders.length === 0, offenders.join(', ') || `${files.length} files clean`);
ok('...and does not climb out of its own tree', escapes.length === 0, escapes.join(', ') || 'every relative import lands under its own src');
ok(
  '...by resolving the path, not counting dots',
  landsOutside(`${SRC_ROOT}/packs/belts/index.ts`, '../../../../lyra/src/app/app') && !landsOutside(`${SRC_ROOT}/packs/belts/index.ts`, '../../pack'),
  'a nested pack reaching one floor up is not an escape; reaching into another app is',
);

// ── and depends only on the protocol ─────────────────────────
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
const deps = Object.keys(manifest.dependencies ?? {});
const nisc = deps.filter((d) => d.startsWith('@niscorp/'));
ok('its declared dependencies name no Lyra package', !deps.some((d) => d.includes('lyra')), deps.join(', '));
ok('...and the platform ones are protocol libraries', nisc.every((d) => d === '@niscorp/nova' || d === '@niscorp/vex'), nisc.join(', ') || '(none)');

const BAD = "import { membersList } from '@lyra/app/vex/member.entries';";
ok('...and the rule catches an import that should not exist', [...BAD.matchAll(IMPORT)].some((m) => (m[1] ?? '').startsWith('@lyra/')));

// ── AND NO PACK REACHES INTO ANOTHER ─────────────────────────
//
// One service now hosts several packs, which puts a second boundary inside the
// first. It is the one that will matter: Belts holding rank data and a payments
// pack holding a Stripe key are in the same process, and the only thing keeping
// the first out of the second is that it never imports it.
//
// TypeScript will not say no to this — a relative import up and across is
// perfectly legal — so the check is the enforcement. A shared helper two packs
// both want belongs beside `pack.ts`, hoisted deliberately, not reached for
// sideways.
const packDir = (path: string): string | undefined => path.match(/\/src\/packs\/([^/.]+)/)?.[1];
const crossPack: string[] = [];
for (const file of files) {
  const home = packDir(file.path);
  if (home === undefined) continue;
  for (const match of file.text.matchAll(IMPORT)) {
    const spec = match[1] ?? '';
    if (!spec.startsWith('.')) continue;
    // Resolve the specifier against the importing file to see where it lands.
    const landed = join(file.path, '..', spec).replace(/\\/g, '/');
    const target = packDir(`/src/packs/${landed.split('/src/packs/')[1] ?? ''}`);
    if (target !== undefined && target !== home) crossPack.push(`${file.path} → ${spec}`);
  }
}
ok('no pack imports another pack', crossPack.length === 0, crossPack.join(', ') || `${new Set(files.map((f) => packDir(f.path)).filter(Boolean)).size} packs, each its own`);

// The rule has to be able to see one, or it is a comment.
ok(
  '...and the rule would catch one',
  packDir('/x/src/packs/belts/index.ts') === 'belts' && packDir('/x/src/packs/stripe/store.ts') === 'stripe',
  'a pack is its directory, and two directories are two packs',
);

// ── the other direction ──────────────────────────────────────
const lyraFiles = walk('src').map((path) => ({ path: path.replace(/\\/g, '/'), text: readFileSync(path, 'utf8') }));
const reachingIn = lyraFiles
  .filter(
    (f) =>
      ![
        'src/dev/integrations-check.ts',
        'src/dev/separation-check.ts',
        'src/dev/admin-check.ts',
        'src/dev/perimeter-check.ts',
        'src/dev/webhook-check.ts',
        'src/dev/frame-check.ts',
        'src/dev/stripe-check.ts',
        'src/dev/billing-check.ts',
        // Reads the other services' SOURCE AS TEXT, looking for fingerprint
        // literals — consumption evidence for the entry-caller rule. It
        // imports nothing across the wire.
        'src/dev/reachable-check.ts',
      ].some((named) => f.path.endsWith(named)),
  )
  .filter((f) => f.text.includes('lyra-integrations') || f.text.includes('lyra-admin'))
  .map((f) => f.path);
ok('Lyra reaches into the other services only from named checks', reachingIn.length === 0, reachingIn.join(', ') || 'two checks that boot them, and nothing else');

report('two systems, one wire: neither can import the other.');
