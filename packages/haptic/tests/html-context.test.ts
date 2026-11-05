import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { isDocument } from 'domhandler';
import {
  createHtmlContextOperation,
  HtmlContextOutputSchema,
  HtmlContextPolicySchema,
} from '../src/discovery/html-context.js';
import { discoveryProfile } from '../src/discovery/index.js';
import { createHtmlStructure, readHtmlProfile } from '../src/readers/html/index.js';

const policy = HtmlContextPolicySchema.parse(discoveryProfile.htmlContext.policy);
const operation = createHtmlContextOperation();
const document = (html: string) => ({
  url: 'https://example.test/page',
  sha256: createHash('sha256').update(html).digest('hex'),
  encoding: 'utf-8',
  html,
});
const prepare = async (html: string, customPolicy = policy) =>
  HtmlContextOutputSchema.parse(
    await operation.run(
      { document: document(html), policy: customPolicy },
      { signal: new AbortController().signal },
    ),
  );
let passed = 0;
const check = async (name: string, run: () => Promise<void>): Promise<void> => {
  await run();
  passed++;
  console.log('[pass] HTML context: ' + name);
};

await check('clears payloads, retains useful markup and reports UTF-8 sizes', async () => {
  const html =
    '<!doctype html><html><head><base href="/files/"><meta name="citation_pdf_url" content="report.pdf"><style>p { color: red }</style><script>window.x="script-secret"</script><script type="application/ld+json">{"secret":"json-secret"}</script></head><body><main class="results" style="color:red" onclick="run()"><h1>Grüße 👋</h1><a href="report.pdf" data-id="123">Report</a><a href="  JavaScript:run()">Action</a></main></body></html>';
  const input = document(html);
  const saved = structuredClone(input);
  const output = HtmlContextOutputSchema.parse(
    await operation.run({ document: input, policy }, { signal: new AbortController().signal }),
  );
  assert.deepEqual(input, saved);
  assert.equal(output.sourceSha256, input.sha256);
  assert(!output.html.includes('script-secret'));
  assert(!output.html.includes('json-secret'));
  const structure = createHtmlStructure(output.html);
  assert.equal(structure.query('script').length, 2);
  assert.equal(structure.query('style').length, 1);
  assert.equal(structure.query('main[style][onclick]').length, 1);
  assert.equal(structure.query('main')[0]?.attribs.onclick, '');
  assert.equal(structure.query('a')[1]?.attribs.href, '');
  assert.equal(structure.query('a[href="report.pdf"]')[0]?.attribs['data-id'], '123');
  assert.equal(structure.query('meta')[0]?.attribs.content, 'report.pdf');
  assert.equal(structure.baseFacts().firstBase?.href, '/files/');
  const main = structure.query('main')[0];
  assert(main);
  assert(structure.textOf(main).includes('Grüße 👋'));
  assert.equal(output.report.inputHtmlBytes, Buffer.byteLength(html));
  assert.equal(output.report.outputHtmlBytes, Buffer.byteLength(output.html));
  assert.equal(output.report.clearedText.values, 3);
  assert.equal(output.report.clearedAttributes.values, 3);
});

await check(
  'structural locators keep positions through tables, templates and foreign content',
  async () => {
    const html =
      '<main><script>secret</script><table><tr><td><a href="a">A</a></td></tr></table><template><style>secret</style><a href="b">B</a></template><svg><style>secret</style><a href="c">C</a></svg><p>Tail';
    const output = await prepare(html, { ...policy, clearContentsOf: [] });
    const before = createHtmlStructure(html),
      after = createHtmlStructure(output.html);
    const fingerprint = (structure: ReturnType<typeof createHtmlStructure>) =>
      structure.query('*').map((node) => ({
        name: node.name,
        path: structure.pathOf(node),
        href: node.attribs.href,
      }));
    assert.deepEqual(fingerprint(after), fingerprint(before));
    assert(!output.html.includes('secret'));
  },
);

await check('policy owns clearing; no site or tag decisions in the operation', async () => {
  const output = await prepare(
    '<main><p data-secret="gone" data-keep="ok">remove me</p><script>keep me</script></main>',
    {
      representation: 'parsed-html',
      clearTextIn: ['p'],
      clearAttributeValues: ['data-secret'],
      clearAttributeNamePrefixes: [],
      clearAttributeValuePrefixes: [],
    },
  );
  assert(!output.html.includes('remove me'));
  assert(output.html.includes('keep me'));
  assert(output.html.includes('data-secret=""'));
  assert(output.html.includes('data-keep="ok"'));
});

await check('normalizes markup even when no payload needs clearing', async () => {
  const html = '<P data-x=unquoted> A &amp; B';
  const output = await prepare(html);
  const parsed = createHtmlStructure(output.html);
  const paragraph = parsed.query('p[data-x="unquoted"]')[0];
  assert(paragraph);
  assert.equal(parsed.textOf(paragraph), ' A & B');
  assert.equal(output.report.policy.representation, 'parsed-html');
  assert.deepEqual(output.report.clearedText, { values: 0, bytes: 0 });
  assert.deepEqual(output.report.clearedAttributes, { values: 0, bytes: 0 });
});

await check(
  'document declarations preserve legacy parsing modes and quoted identifiers',
  async () => {
    for (const declaration of [
      '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">',
      '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "">',
      '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">',
      '<!DOCTYPE html SYSTEM "about:legacy-compat">',
      '<!DOCTYPE html PUBLIC \'A "quoted" identifier\'>',
      '<!DOCTYPE html>',
    ]) {
      const html =
        declaration +
        '<!-- declaration control --><p><table class="records"><tr><td>One</td></tr></table><p>Tail';
      const output = await prepare(html);
      const before = createHtmlStructure(html),
        after = createHtmlStructure(output.html);
      const elements = (tree: ReturnType<typeof createHtmlStructure>) =>
        tree
          .query('*')
          .map((node) => ({ name: node.name, path: tree.pathOf(node), text: tree.textOf(node) }));
      assert.deepEqual(elements(after), elements(before));
      assert(output.html.includes('<!-- declaration control -->'));
      const mode = (text: string) => {
        const root = load(text).root().get(0);
        assert(root && isDocument(root));
        return root['x-mode'];
      };
      assert.equal(mode(output.html), mode(html));
      const textOnly = declaration + '<p>Text without a structural mode difference</p>';
      assert.equal(mode((await prepare(textOnly)).html), mode(textOnly));
    }
  },
);

await check(
  'default preparation omits SVG contents and keeps surrounding records unchanged',
  async () => {
    const html =
      '<main><svg aria-label="icon"><g>omitted-payload</g></svg><p><a href="/item">Record</a></p></main>';
    const input = document(html);
    const saved = structuredClone(input);
    const result = HtmlContextOutputSchema.parse(
      await operation.run({ document: input, policy }, { signal: new AbortController().signal }),
    );
    assert(!result.html.includes('omitted-payload'));
    const before = createHtmlStructure(html),
      after = createHtmlStructure(result.html);
    assert.equal(after.query('svg:empty').length, 1);
    for (const selector of ['p', 'a']) {
      const a = before.query(selector)[0],
        b = after.query(selector)[0];
      assert(a && b);
      assert.deepEqual(after.pathOf(b), before.pathOf(a));
      assert.equal(after.textOf(b), before.textOf(a));
      assert.deepEqual(b.attribs, a.attribs);
    }
    assert.deepEqual(input, saved);
    assert.equal(result.report.clearedContents.values, 1);
  },
);

await check(
  'content clearing follows JSON selectors and counts overlapping targets once',
  async () => {
    const result = await prepare(
      '<section data-target="yes"><div>Grüße 👋</div></section><p>Keep</p>',
      {
        ...policy,
        clearAttributeValues: ['data-target'],
        clearContentsOf: ["section[data-target='yes']", 'div', 'section'],
      },
    );
    assert.equal(result.report.clearedContents.values, 1);
    assert.equal(result.report.clearedContents.bytes, Buffer.byteLength('<div>Grüße 👋</div>'));
    assert(result.html.includes('data-target=""'));
    assert(result.html.includes('<p>Keep</p>'));
    await assert.rejects(prepare('<p>A</p>', { ...policy, clearContentsOf: ['['] }));
  },
);

await check(
  'normalization preserves parsed element relationships and non-ASCII values',
  async () => {
    const html =
      '<style>secret</style>👋<main><p><table><tr><td><a HREF = \' javascript&#58;run()\' TITLE="Grüße">A</a></table></main>';
    const output = await prepare(html);
    const before = createHtmlStructure(html),
      after = createHtmlStructure(output.html);
    assert(output.html.includes('👋'));
    assert(!output.html.includes('secret'));
    assert.equal(after.query('a')[0]?.attribs.href, '');
    assert.equal(after.query('a')[0]?.attribs.title, 'Grüße');
    assert.deepEqual(
      after.query('*').map((node) => after.pathOf(node)),
      before.query('*').map((node) => before.pathOf(node)),
    );
  },
);

await check('foreign script comments and namespaced code attributes are cleared', async () => {
  const output = await prepare(
    '<svg><script><!--secret--><g>code</g></script><a xlink:href="javascript:run()">A</a></svg>',
    { ...policy, clearContentsOf: [] },
  );
  assert(output.html.includes('<script><!----><g></g></script>'));
  assert(output.html.includes('xlink:href=""'));
  assert(!output.html.includes('secret'));
  assert(!output.html.includes('code'));
});

await check('duplicate and reconstructed attributes do not leak configured payloads', async () => {
  const html =
    '<main STYLE="a" style="b" Onclick="x" onclick="y"><a href="ok" href="javascript&#58;secret()">A</a><b style="z"><p>X</b>Y</main>';
  const output = await prepare(html);
  const structure = createHtmlStructure(output.html);
  assert.equal(structure.query('main')[0]?.attribs.style, '');
  assert.equal(structure.query('main')[0]?.attribs.onclick, '');
  assert.equal(structure.query('a')[0]?.attribs.href, 'ok');
  assert(!output.html.includes('secret()'));
  assert(structure.query('b').every((node) => node.attribs.style === ''));
  assert.equal(output.report.clearedAttributes.values, 4);
});

await check('nested links are shown as the same repaired records used by extraction', async () => {
  const html =
    '<article><a href="/entry" class="record"><img src="/picture"><div><h3>Heading</h3><p>Register <a href="/register">here</a></p></div></a></article>';
  const output = await prepare(html);
  const original = createHtmlStructure(html),
    prepared = createHtmlStructure(output.html);
  const records = (structure: ReturnType<typeof createHtmlStructure>) =>
    structure.query('a.record').map((node) => ({
      href: node.attribs.href,
      headingMatches: structure.queryWithin('h3', node).length,
      text: structure.textOf(node),
    }));
  assert.deepEqual(records(prepared), records(original));
  assert.deepEqual(
    records(prepared).map((record) => record.headingMatches),
    [0, 1, 0],
  );
  const first = prepared.query('a.record')[0];
  assert(first);
  assert(!prepared.htmlOf(first).includes('<h3'));
  assert(output.html.indexOf('</a>') < output.html.indexOf('<h3>'));
  assert(html.indexOf('</a>') > html.indexOf('<h3>'));
});

await check(
  'non-round-trippable HTML fails explicitly instead of misrepresenting the tree',
  async () => {
    await assert.rejects(
      prepare('<form id="a"><div></form><form id="b"><input name="x"></form></div>'),
      /HTML_CONTEXT_STRUCTURE_CHANGED/,
    );
    await assert.rejects(
      prepare('<!DOCTYPE html PUBLIC><p>Unrepresentable mode</p>'),
      /HTML_CONTEXT_STRUCTURE_CHANGED/,
    );
    for (const [html, clearAttributeValues] of [
      [
        '<math><annotation-xml encoding="text/html"><div>A</div></annotation-xml></math>',
        ['encoding'],
      ],
      ['<table><input type="hidden"></table>', ['type']],
    ] as const)
      await assert.rejects(
        prepare(html, { ...policy, clearAttributeValues: [...clearAttributeValues] }),
        /HTML_CONTEXT_STRUCTURE_CHANGED/,
      );
  },
);

await check('a large attribute list is cleared completely', async () => {
  const count = 2000;
  const html =
    '<main ' +
    Array.from({ length: count }, (_, index) => 'on' + index + '="code"').join(' ') +
    '>A</main>';
  const output = await prepare(html);
  assert.equal(output.report.clearedAttributes.values, count);
  assert(!output.html.includes('code'));
});

await check(
  'parser reconstruction cannot exceed the existing decoded HTML byte allowance',
  async () => {
    const html = '<p><b class="' + 'x'.repeat(2000) + '">row</p>' + '<p>row</p>'.repeat(100);
    const profile = readHtmlProfile();
    const bounded = createHtmlContextOperation({
      html: { ...profile, limits: { ...profile.limits, maxIndexBytes: 60_000 } },
    });
    assert(Buffer.byteLength(html) < 60_000);
    await assert.rejects(
      bounded.run({ document: document(html), policy }, { signal: new AbortController().signal }),
      /HTML_CONTEXT_OUTPUT_BYTE_BUDGET/,
    );
  },
);

await check('invalid policy, cancellation and reader resource limits fail explicitly', async () => {
  await assert.rejects(
    operation.run(
      { document: document('<p>A</p>'), policy: { ...policy, unknown: true } },
      { signal: new AbortController().signal },
    ),
  );
  const aborted = AbortSignal.abort(new Error('cancelled'));
  await assert.rejects(
    operation.run({ document: document('<p>A</p>'), policy }, { signal: aborted }),
    /cancelled/,
  );
  const htmlProfile = readHtmlProfile();
  const small = createHtmlContextOperation({
    html: { ...htmlProfile, limits: { ...htmlProfile.limits, maxDepth: 4 } },
  });
  await assert.rejects(
    small.run(
      { document: document('<div>'.repeat(10)), policy },
      { signal: new AbortController().signal },
    ),
    /DEPTH_BUDGET/,
  );
});
console.log('HTML context checks passed: ' + passed);
