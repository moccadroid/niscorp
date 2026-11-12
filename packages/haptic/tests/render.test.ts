import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderHtml, showsDecoyLinks } from '../src/render/index.js';

// SQLite's download page points every link at a decoy (hp1.html) until a timer in its own script sets the address.
const sqlite = readFileSync(
  new URL('./fixtures/render/sqlite-download.html', import.meta.url),
  'utf8',
);
assert.equal(showsDecoyLinks(sqlite), true);
assert.match(sqlite, /id='a7' href='hp1.html'/);
const rendered = await renderHtml(sqlite, 'https://www.sqlite.org/download.html');
assert.match(rendered, /id="a7" href="2026\/sqlite-tools-linux-x64-3540100.zip"/);

// Ordinary repeated links (one address, one text) are not a decoy; inline scripts still run when asked to render.
const plain =
  '<html><body><a href="/a">Home</a><a href="/a">Home</a><a id="x" href="/b">B</a><script>document.getElementById("x").href="/c"</script></body></html>';
assert.equal(showsDecoyLinks(plain), false);
assert.match(await renderHtml(plain, 'https://example.com/'), /id="x" href="\/c"/);

// The flags the child runs with: reads only its allowed folder, writes nothing, starts no process.
const secretFolder = mkdtempSync(join(tmpdir(), 'haptic-render-'));
const secret = join(secretFolder, '.env');
writeFileSync(secret, 'KEY=secret');
const allowed = mkdtempSync(join(tmpdir(), 'haptic-render-allowed-'));
const probe = join(allowed, 'probe.cjs');
writeFileSync(
  probe,
  `const fs = require('fs');
const out = [];
try { fs.readFileSync(${JSON.stringify(secret)}); out.push('read'); } catch { out.push('no-read'); }
try { fs.writeFileSync(${JSON.stringify(join(allowed, 'x.txt'))}, 'x'); out.push('write'); } catch { out.push('no-write'); }
try { require('child_process').execFileSync(process.execPath, ['-e', '0']); out.push('spawn'); } catch { out.push('no-spawn'); }
process.stdout.write(out.join(','));`,
);
const result = spawnSync(process.execPath, ['--permission', `--allow-fs-read=${allowed}`, probe], {
  encoding: 'utf8',
  env: {},
});
assert.equal(result.stdout, 'no-read,no-write,no-spawn');

console.log('render: decoy signal, inline scripts, permission flags');
