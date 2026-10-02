import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { QA_BROKEN_BUNDLE, QA_BUNDLE } from './bundle';

// Publishes the QA Company as static files: <dir>/vendor/bundle and
// <dir>/vendor-broken/bundle. moss registers an integration by fetching
// `<url>/bundle` and reading it as JSON, so a file on any static host is a
// complete integration — the showroom's GitHub Pages deploy calls this.
const dir = process.argv[2];
if (dir === undefined) throw new Error('usage: publish:to <dir>');

for (const [folder, bundle] of [['vendor', QA_BUNDLE], ['vendor-broken', QA_BROKEN_BUNDLE]] as const) {
  const out = resolve(dir, folder);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'bundle'), JSON.stringify(bundle, null, 2));
  console.log(`[vendor] ${join(out, 'bundle')}`);
}
