import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { hasChildren } from 'domhandler';
import type { AnyNode } from 'domhandler';
import { createHtmlStructure, validateLocator } from '../src/readers/html/index.js';

let passed = 0;
const check = (name: string, run: () => void): void => {
  run();
  passed++;
  process.stdout.write('[pass] HTML selection: ' + name + '\n');
};
check('the indexed document can serialize its whole private tree', () => {
  const source = '<!doctype html><!--outside--><main><p>Text</p></main>';
  const native = createHtmlStructure(source);
  assert.equal(native.root.type, 'root');
  const serialized = native.htmlOf();
  assert(serialized.toLowerCase().includes('<!doctype html>'));
  assert(serialized.includes('<!--outside-->'));
  assert(serialized.includes('<main><p>Text</p></main>'));
});
check('scoped CSS selects source elements in document order without duplicates', () => {
  const native = createHtmlStructure(
    '<a href="/menu">menu</a><main><p>A</p><a href="/one">one</a><div><a href="/two">two</a></div></main>',
  );
  const selected = native.query('main p, main a, main a[href]');
  assert.deepEqual(
    selected.map((node) => node.name),
    ['p', 'a', 'a'],
  );
  assert.deepEqual(
    native.query('main > a').map((node) => node.attribs['href']),
    ['/one'],
  );
  assert.deepEqual(
    native.query('main a:not(main > a)').map((node) => node.attribs['href']),
    ['/two'],
  );
});
check('text retains whitespace and excludes script, style, template and noscript content', () => {
  const native = createHtmlStructure(
    '<main>A \n<em>B</em><!-- ignored --><script>throw 1</script><style>x</style><template>hidden</template><noscript>hidden</noscript>C</main>',
  );
  const main = native.query('main')[0];
  assert(main);
  assert.equal(native.textOf(main), 'A \nBC');
  for (const node of native.query('script, style, template, noscript'))
    assert.equal(native.textOf(node), '');
});
check('source paths retain exact child ordinals, including text and comments', () => {
  const html = '<main><p>text<!-- comment --><em id="selected">nested</em></p></main>';
  const native = createHtmlStructure(html);
  const selected = native.query('#selected')[0];
  assert(selected);
  let node: AnyNode | undefined = load(html).root().get(0);
  for (const ordinal of native.pathOf(selected))
    node = node && hasChildren(node) ? node.children[ordinal] : undefined;
  assert(node && 'attribs' in node);
  assert.equal(node.attribs['id'], 'selected');
});
check('syntax checks reject unsupported selectors', () => {
  for (const selector of [
    '',
    'svg|a',
    'p::before',
    'p:hover',
    'p:not(:hover)',
    'p:nth-child(broken)',
  ]) {
    assert.throws(() => validateLocator(selector), /HTML_SELECTOR/);
  }
  for (const selector of ['main > a[href]', 'p:nth-child(2)', 'p, a[href]'])
    validateLocator(selector);
});
check('byte, node, element, depth and index bounds remain enforced', () => {
  assert.throws(() => createHtmlStructure('<main/>', { maxIndexBytes: 4 }), /SOURCE_BYTE_BUDGET/);
  assert.throws(() => createHtmlStructure('<div>'.repeat(50), { maxDepth: 8 }), /DEPTH_BUDGET/);
  assert.throws(() => createHtmlStructure('<p>A</p><p>B</p>', { maxNodes: 4 }), /NODE_BUDGET/);
  assert.throws(
    () => createHtmlStructure('<p>A</p><p>B</p>', { maxElements: 4 }),
    /ELEMENT_BUDGET/,
  );
  assert.throws(
    () => createHtmlStructure('<main>A</main>', { maxIndexBytes: 128 }),
    /INDEX_BYTE_BUDGET/,
  );
});
check('cancellation propagates to retained document operations', () => {
  const controller = new AbortController();
  const native = createHtmlStructure('<main>text</main>', {}, controller.signal);
  const main = native.query('main')[0];
  assert(main);
  controller.abort();
  assert.throws(() => native.query('main'));
  assert.throws(() => native.textOf(main));
  assert.throws(() => native.pathOf(main));
  assert.throws(() => native.baseFacts());
  assert.throws(() => createHtmlStructure('<main/>', {}, controller.signal));
});
check(
  'metadata remains selectable while noscript anchors remain inert in the same parser mode',
  () => {
    const native = createHtmlStructure(
      '<meta name="citation_pdf_url" content="/report.pdf"><noscript><a href="/fallback.pdf">PDF</a></noscript>',
    );
    assert.equal(native.query('a').length, 0);
    assert.equal(
      native.query('meta[name="citation_pdf_url"]')[0]?.attribs['content'],
      '/report.pdf',
    );
  },
);
process.stdout.write(
  'HTML selection: ' + passed + ' behavior groups passed; unused extraction features removed.\n',
);
