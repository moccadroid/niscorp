import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const root = new URL('../', import.meta.url);
const manifest = z
  .object({ files: z.array(z.string()) })
  .parse(JSON.parse(await readFile(new URL('package.json', root), 'utf8')));
const documents = manifest.files.filter((entry) => entry.endsWith('.md'));
let links = 0;

for (const document of documents) {
  const file = new URL(document, root);
  const content = await readFile(file, 'utf8');
  for (const match of content.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = match[1];
    assert(target);
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) continue;
    const destination = new URL(target, file);
    const name = relative(fileURLToPath(root), fileURLToPath(destination)).replaceAll('\\', '/');
    assert(
      manifest.files.some((entry) => name === entry || name.startsWith(entry + '/')),
      document + ' links to an unpublished file: ' + name,
    );
    await access(destination);
    links++;
  }
}

console.log(
  'Package documentation: ' +
    documents.length +
    ' declared documents and ' +
    links +
    ' relative links checked.',
);
