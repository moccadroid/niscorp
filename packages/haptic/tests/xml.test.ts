import assert from 'node:assert/strict';
import { z } from 'zod';
import { createWebOperations } from '../src/operations/index.js';
import { captureBody } from '../src/operations/http-source.js';
import { createXmlOperations } from '../src/operations/xml.js';
import { OperationFailure, RunControl } from '../src/engine/control.js';
import { snapshotJson } from '../src/engine/json.js';

const source = (input: string | Buffer, type = 'application/xml') => {
  const body = captureBody(typeof input === 'string' ? Buffer.from(input) : input);
  return {
    url: 'https://fixture.invalid/data',
    status: 200,
    headers: { 'content-type': [type] },
    encoded: body,
    body,
  };
};
const web = createWebOperations();
const profile = {
  maxInputBytes: 8192,
  maxNodes: 100,
  maxDepth: 10,
  maxSelectedItems: 10,
  maxFieldValues: 100,
  maxFieldBytes: 8192,
};
const ops = createXmlOperations(profile, 100);
const select = ops['xml.select'];
assert(select);
const run = async (xml: string | Buffer, rule: unknown, type?: string) =>
  z
    .object({ items: z.array(z.record(z.string(), z.json())) })
    .parse(
      await select.run(
        { source: source(xml, type), rule: snapshotJson(rule, 100) },
        { signal: AbortSignal.timeout(30000) },
      ),
    ).items;
const rule = {
  selector: '/x:root/x:row[@active="yes"]',
  namespaces: { x: 'urn:records' },
  fields: {
    caption: 'string(x:title)',
    refs: 'x:ref/@href',
    present: 'boolean(x:title)',
    $value: 'string(@id)',
    amount: 'string(x:amount)',
  },
};
const xml =
  '<root xmlns="urn:records"><row active="yes" id="a"><title>A &amp; B<![CDATA[!]]></title><ref href="one"/><ref href="two"/><amount>1.20</amount></row><row active="no"><title>Excluded</title></row></root>';
let groups = 0;
try {
  assert.deepEqual(await run(xml, rule), [
    { caption: 'A & B!', refs: ['one', 'two'], present: true, $value: 'a', amount: '1.20' },
  ]);
  const renamed =
    '<n:root xmlns:n="urn:records"><n:row active="yes" id="b"><n:title>Changed</n:title><n:amount>9.99</n:amount></n:row><n:row active="yes" id="new"><n:title>Added</n:title></n:row></n:root>';
  assert.deepEqual(await run(renamed, rule), [
    { caption: 'Changed', refs: [], present: true, $value: 'b', amount: '9.99' },
    { caption: 'Added', refs: [], present: true, $value: 'new', amount: '' },
  ]);
  assert.deepEqual(await run('<root xmlns="urn:records"/>', rule), []);
  assert.deepEqual(
    await run(
      '<root xmlns="urn:other"><row active="yes"><title>Unrelated namespace</title></row></root>',
      rule,
    ),
    [],
  );
  const raw = source(xml);
  const before = structuredClone(raw);
  await select.run({ source: raw, rule }, { signal: AbortSignal.timeout(30000) });
  assert.deepEqual(raw, before);
  groups++;

  const textRule = { selector: '/root/row', namespaces: {}, fields: { value: 'string(.)' } };
  const utf16 = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from('<?xml version="1.0" encoding="UTF-16"?><root><row>Grüße</row></root>', 'utf16le'),
  ]);
  assert.deepEqual(await run(utf16, textRule, 'application/xml; charset=iso-8859-1'), [
    { value: 'Grüße' },
  ]);
  const latin = Buffer.from(
    '<?xml version="1.0" encoding="iso-8859-1"?><root><row>Grüße</row></root>',
    'latin1',
  );
  assert.deepEqual(await run(latin, textRule), [{ value: 'Grüße' }]);
  assert.deepEqual(
    await run(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('<root><row>UTF8</row></root>')]),
      textRule,
    ),
    [{ value: 'UTF8' }],
  );
  assert.deepEqual(
    await run(
      Buffer.from('<root><row>é</row></root>', 'latin1'),
      textRule,
      'text/xml; charset=iso-8859-1',
    ),
    [{ value: 'é' }],
  );
  groups++;

  for (const malformed of [
    '<root><bad></root>',
    '<root a="1" a="2"/>',
    '<root>&missing;</root>',
    '<root><x:item/></root>',
    '<root/><other/>',
    '<root attr=unquoted/>',
    '<root>&#0;</root>',
    '<root>\u0001</root>',
    '<root xmlns:a="urn:u" xmlns:b="urn:u" a:x="1" b:x="2"/>',
    '<root xmlns:xml="urn:wrong"/>',
  ])
    await assert.rejects(
      run(malformed, textRule),
      (error: unknown) => error instanceof OperationFailure && error.code === 'XML_PARSE',
    );
  await assert.rejects(
    run('<!DOCTYPE root SYSTEM "https://fixture.invalid/dtd"><root/>', textRule),
    /DTD declarations/,
  );
  await assert.rejects(
    run(Buffer.from([0x3c, 0x72, 0x3e, 0xff]), textRule),
    (e: unknown) => e instanceof OperationFailure && e.code === 'XML_ENCODING',
  );
  await assert.rejects(run(Buffer.from([0, 0, 0xfe, 0xff]), textRule), /UTF-32/);
  await assert.rejects(
    run('<root/>', textRule, 'application/xml; charset=not-an-encoding'),
    /encoding/i,
  );
  await assert.rejects(
    select.run(
      { source: { ...raw, body: { ...raw.body, sha256: 'bad' } }, rule },
      { signal: AbortSignal.timeout(30000) },
    ),
    /body.*match/i,
  );
  groups++;

  await assert.rejects(run(xml, { ...rule, selector: 'string(/*)' }), /element nodes/);
  await assert.rejects(run(xml, { ...rule, selector: '///[' }), /XPath|Unexpected|Invalid/i);
  await assert.rejects(
    run(xml, { ...rule, namespaces: {} }),
    (e: unknown) => e instanceof OperationFailure && e.code === 'XML_XPATH',
  );
  await assert.rejects(
    run(xml, { ...rule, fields: { number: 'number("not a number")' } }),
    /finite number/,
  );
  groups++;
  for (const field of ['fields', 'namespaces']) {
    const unsupported = {
      ...rule,
      [field]: JSON.parse(
        '{"__proto__":"string(.)","constructor":"string(.)","$value":"string(.)"}',
      ),
    };
    await assert.rejects(run(xml, unsupported), /__proto__/);
  }

  for (const override of [
    { maxInputBytes: 5 },
    { maxDepth: 1 },
    { maxNodes: 2 },
    { maxSelectedItems: 1 },
  ]) {
    const limited = createXmlOperations({ ...profile, ...override }, 100);
    const limitedSelect = limited['xml.select'];
    assert(limitedSelect);
    await assert.rejects(
      limitedSelect.run(
        { source: source(xml), rule: { ...rule, selector: '//*' } },
        { signal: AbortSignal.timeout(30000) },
      ),
      /allowance/,
    );
  }
  const attributeLimit = createXmlOperations({ ...profile, maxNodes: 2 }, 100)['xml.select'];
  assert(attributeLimit);
  await assert.rejects(
    attributeLimit.run(
      {
        source: source('<root a="1" b="2"/>'),
        rule: { selector: '/root', namespaces: {}, fields: { attrs: '@*' } },
      },
      { signal: AbortSignal.timeout(30000) },
    ),
    /allowance/,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(select.run({ source: raw, rule }, { signal: controller.signal }), /abort/i);
  groups++;
  assert(web.operations['xml.select']);
  const repeated = '<root>' + '<row>Grüße!</row>'.repeat(4) + '</root>';
  const repeatedRule = { selector: '/root/row', namespaces: {}, fields: { all: '//row' } };
  for (const [override, code] of [
    [{ maxFieldValues: 15 }, 'XML_FIELD_VALUES'],
    [{ maxFieldBytes: 139 }, 'XML_FIELD_BYTES'],
  ] as const) {
    const limited = createXmlOperations({ ...profile, ...override }, 100)['xml.select'];
    assert(limited);
    await assert.rejects(
      limited.run(
        { source: source(repeated), rule: repeatedRule },
        { signal: AbortSignal.timeout(30000) },
      ),
      (error: unknown) => error instanceof RunControl && error.code === code,
    );
  }
  // 4 keys of 3 bytes plus 16 UTF-8 strings of 8 bytes: inclusive boundary 140.
  const boundary = createXmlOperations({ ...profile, maxFieldValues: 16, maxFieldBytes: 140 }, 100)[
    'xml.select'
  ];
  assert(boundary);
  assert.equal(
    z
      .object({ items: z.array(z.json()) })
      .parse(
        await boundary.run(
          { source: source(repeated), rule: repeatedRule },
          { signal: AbortSignal.timeout(30000) },
        ),
      ).items.length,
    4,
  );
  groups++;
  console.log(
    'XML mechanics: ' +
      groups +
      ' groups passed; native XPath, namespaces, encoding, source preservation, strict failures and limits.',
  );
} finally {
  web.close();
}
