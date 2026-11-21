import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderHtml, showsDecoyLinks } from '../src/render/index.js';

const closesNetwork = process.allowedNodeEnvironmentFlags.has('--allow-net');

// SQLite's download page points every link at a decoy (hp1.html) until a timer in its own script sets the address.
const sqlite = readFileSync(
  new URL('./fixtures/render/sqlite-download.html', import.meta.url),
  'utf8',
);
assert.equal(showsDecoyLinks(sqlite), true);
assert.match(sqlite, /id='a7' href='hp1.html'/);

// Ordinary repeated links (one address, one text) are not a decoy; inline scripts still run when asked to render.
const plain =
  '<html><body><a href="/a">Home</a><a href="/a">Home</a><a id="x" href="/b">B</a><script>document.getElementById("x").href="/c"</script></body></html>';
assert.equal(showsDecoyLinks(plain), false);

if (closesNetwork) {
  const rendered = await renderHtml(sqlite, 'https://www.sqlite.org/download.html');
  assert.match(rendered, /id="a7" href="2026\/sqlite-tools-linux-x64-3540100.zip"/);
  assert.match(await renderHtml(plain, 'https://example.com/'), /id="x" href="\/c"/);
}

// A page's script reaches Node itself (jsdom is not a sandbox) and tries every way out: jsdom's XHR, Node's fetch, a
// bare connection, killing a process, another process's inspector. None of them may leave the render process.
const connections: string[] = [];
const listener = createServer((socket) => {
  connections.push('connection');
  socket.destroy();
});
await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
const address = listener.address();
assert(address !== null && typeof address === 'object');
const escaping = `<html><body><p id="out"></p><script>
const at = 'http://127.0.0.1:${address.port}/';
const node = window.constructor.constructor('return process')();
document.getElementById('out').textContent = [typeof node.kill, typeof node._kill, typeof node._debugProcess].join(',');
try { const xhr = new XMLHttpRequest(); xhr.open('GET', at + 'xhr'); xhr.send(); } catch {}
try { window.constructor.constructor('return fetch')()(at + 'fetch').catch(() => {}); } catch {}
try { node.getBuiltinModule('node:net').connect(${address.port}, '127.0.0.1').on('error', () => {}); } catch {}
</script></body></html>`;
if (closesNetwork) {
  const rendered = await renderHtml(escaping, 'https://example.com/');
  assert.match(rendered, /<p id="out">undefined,undefined,undefined<\/p>/);
} else {
  await assert.rejects(renderHtml(escaping, 'https://example.com/'), /Node 25 or later/);
}
await new Promise((resolve) => setTimeout(resolve, 200));
listener.close();
assert.deepEqual(connections, []);

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

console.log(
  closesNetwork
    ? 'render: decoy signal, inline scripts, a page that reaches Node stays inside, permission flags'
    : 'render: decoy signal, refused on a Node that cannot close the network, permission flags',
);
