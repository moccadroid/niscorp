import assert from 'node:assert/strict';
import {
  decodeHtmlSource,
  createHtmlStructure,
  effectiveHtmlBase,
  resolveHtmlUrl,
  readHtmlProfile,
} from '../src/readers/html/index.js';

let passed = 0;
const check = (name: string, run: () => void): void => {
  run();
  passed += 1;
  process.stdout.write('[pass] HTML charset/base: ' + name + '\n');
};
const baseOf = (
  html: string,
  url = 'https://example.test/redirected/page?q=kept',
): ReturnType<typeof effectiveHtmlBase> =>
  effectiveHtmlBase(createHtmlStructure(html), url, {}, 'utf-8');
check('ordinary script/comment charset text is not a declaration', () => {
  const html =
    '<!-- charset="windows-1252" --><script>const label=\'charset="windows-1252"\';</script><p>Grüße</p>';
  const result = decodeHtmlSource(Buffer.from(html), {});
  assert.equal(result.encoding, 'utf-8');
  assert.equal(result.html, html);
});
check('BOM overrides transport and meta while transport overrides meta', () => {
  const html = '<meta charset="windows-1252"><p>Grüße</p>',
    bytes = Buffer.from(html);
  const bom = decodeHtmlSource(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes]), {
    'content-type': ['text/html; charset=windows-1252'],
  });
  assert.equal(bom.encoding, 'utf-8');
  assert.equal(bom.html, html);
  assert.equal(
    decodeHtmlSource(bytes, { 'Content-Type': ['Text/HTML; Charset="utf-8"'] }).html,
    html,
  );
});
check('genuine meta labels decode original bytes without mutating them', () => {
  const bytes = Buffer.from('<meta charset="windows-1252"><p>Gr\xfc\xdfe</p>', 'latin1'),
    original = Buffer.from(bytes);
  const result = decodeHtmlSource(bytes, {});
  assert.equal(result.encoding, 'windows-1252');
  assert.equal(result.html, '<meta charset="windows-1252"><p>Grüße</p>');
  assert.deepEqual(bytes, original);
});
check('MIME parser handles quoted fake charset and duplicate parameters', () => {
  const html = '<p>Grüße</p>',
    bytes = Buffer.from(html);
  assert.equal(
    decodeHtmlSource(bytes, { 'content-type': ['text/html; x="a; charset=windows-1252"'] }).html,
    html,
  );
  assert.equal(
    decodeHtmlSource(bytes, { 'content-type': ['text/html; charset=utf-8; charset=windows-1252'] })
      .html,
    html,
  );
  assert.throws(() => decodeHtmlSource(bytes, { 'content-type': ['not a MIME type'] }));
  assert.throws(
    () => decodeHtmlSource(bytes, { 'Content-Type': ['text/html'], 'content-type': ['text/html'] }),
    /AMBIGUOUS/,
  );
});
check('malformed bytes and unsupported profiles refuse explicitly', () => {
  assert.throws(() =>
    effectiveHtmlBase(
      createHtmlStructure('<base href="/files/">'),
      'https://example.test/page',
      {},
      'made-up',
    ),
  );
  for (const prescanBytes of [1, 2, 3, 4, 5])
    assert.throws(() =>
      readHtmlProfile({
        ...readHtmlProfile(),
        charset: { ...readHtmlProfile().charset, prescanBytes },
      }),
    );
  assert.throws(() => decodeHtmlSource(Uint8Array.from([0xc3, 0x28]), {}));
  assert.throws(() =>
    readHtmlProfile({
      ...readHtmlProfile(),
      charset: { prescanBytes: 1024, fallbackEncoding: 'made-up', errors: 'fatal' },
    }),
  );
  assert.throws(() =>
    readHtmlProfile({ ...readHtmlProfile(), base: { csp: 'ignore', urlEncoding: 'utf-8' } }),
  );
});
check('declared prescan and input-byte limits govern the actual decoding', () => {
  const profile = readHtmlProfile(),
    bytes = Buffer.from(
      ' '.repeat(16) + '<meta charset="windows-1252"><p>Gr\xfc\xdfe</p>',
      'latin1',
    );
  assert.match(decodeHtmlSource(bytes, {}, profile).html, /Grüße/);
  assert.throws(() =>
    decodeHtmlSource(bytes, {}, { ...profile, charset: { ...profile.charset, prescanBytes: 8 } }),
  );
  assert.throws(
    () =>
      decodeHtmlSource(bytes, {}, { ...profile, limits: { ...profile.limits, maxInputBytes: 8 } }),
    /BYTE_BUDGET/,
  );
});
check('profiles are copied and frozen before use', () => {
  const input = JSON.parse(JSON.stringify(readHtmlProfile()));
  const profile = readHtmlProfile(input);
  input.charset.fallbackEncoding = 'windows-1252';
  assert.equal(profile.charset.fallbackEncoding, 'utf-8');
  assert(Object.isFrozen(profile.charset));
});
check('no base uses captured final URL; first empty href ignores later bases', () => {
  assert.equal(baseOf('<main>page</main>').baseUrl, 'https://example.test/redirected/page?q=kept');
  assert.equal(
    baseOf('<base><base href=""><base href="https://later.test/">').baseUrl,
    'https://example.test/redirected/page?q=kept',
  );
});
check('first invalid/data/javascript base falls back without selecting another', () => {
  for (const href of ['http://[invalid', 'data:text/html,other', 'javascript:alert(1)']) {
    const actual = baseOf('<base href="' + href + '"><base href="https://later.test/">');
    assert.equal(actual.baseUrl, 'https://example.test/redirected/page?q=kept');
    assert.equal(actual.source?.href, href);
  }
});
check('template and foreign-namespace bases never override the actual HTML base', () => {
  const actual = baseOf(
    '<template><base href="https://template.test/"></template>' +
      '<svg><base href="https://svg.test/"/></svg><base href="../files/?b=2&amp;a=1">',
  );
  assert.equal(actual.baseUrl, 'https://example.test/files/?b=2&a=1');
  assert.equal(actual.source?.href, '../files/?b=2&a=1');
  assert(actual.source?.path.length);
});
check('CSP never refuses a page; only base-uri constrains the declared base', () => {
  const resolve = (policy: string, href = 'https://files.test/downloads/'): string =>
    effectiveHtmlBase(
      createHtmlStructure('<base href="' + href + '">'),
      'https://example.test/page',
      { 'Content-Security-Policy': [policy] },
      'utf-8',
    ).baseUrl;
  assert.equal(resolve("default-src 'none'"), 'https://files.test/downloads/');
  assert.equal(resolve("base-uri 'none'"), 'https://example.test/page');
  assert.equal(resolve("base-uri 'self'"), 'https://example.test/page');
  assert.equal(resolve("base-uri 'self'", '/files/'), 'https://example.test/files/');
  assert.equal(resolve('base-uri'), 'https://example.test/page');
  assert.equal(resolve("base-uri 'none' https://files.test"), 'https://files.test/downloads/');
  assert.equal(
    resolve("base-uri https://files.test; base-uri 'none'"),
    'https://files.test/downloads/',
  );
});
check('multiple enforced policies intersect; report-only does not block', () => {
  const structure = createHtmlStructure('<base href="https://files.test/">');
  assert.equal(
    effectiveHtmlBase(
      structure,
      'https://example.test/',
      { 'content-security-policy': ['base-uri https:', "base-uri 'self'"] },
      'utf-8',
    ).baseUrl,
    'https://example.test/',
  );
  assert.equal(
    effectiveHtmlBase(
      structure,
      'https://example.test/',
      { 'content-security-policy': ["base-uri https:, base-uri 'none'"] },
      'utf-8',
    ).baseUrl,
    'https://example.test/',
  );
  assert.equal(
    effectiveHtmlBase(
      structure,
      'https://example.test/',
      { 'content-security-policy-report-only': ["base-uri 'none'"] },
      'utf-8',
    ).baseUrl,
    'https://files.test/',
  );
});
check('meta policies affect only later bases in the head; inert/body policies are ignored', () => {
  const policy = '<meta http-equiv="Content-Security-Policy" content="base-uri \'none\'">';
  assert.equal(
    baseOf(policy + '<base href="/files/">').baseUrl,
    'https://example.test/redirected/page?q=kept',
  );
  assert.equal(baseOf('<base href="/files/">' + policy).baseUrl, 'https://example.test/files/');
  assert.equal(
    baseOf(
      policy.replace('Content-Security-Policy', ' Content-Security-Policy ') +
        '<base href="/files/">',
    ).baseUrl,
    'https://example.test/files/',
  );
  assert.equal(
    baseOf('<body>' + policy + '<base href="/files/">').baseUrl,
    'https://example.test/files/',
  );
  assert.equal(
    baseOf('<template>' + policy + '</template><base href="/files/">').baseUrl,
    'https://example.test/files/',
  );
  assert.equal(
    baseOf('<svg>' + policy + '</svg><base href="/files/">').baseUrl,
    'https://example.test/files/',
  );
});
check('base-uri handles schemes, host boundaries, ports and percent-decoded path segments', () => {
  const resolve = (policy: string, href: string, url = 'https://example.test/page'): string =>
    effectiveHtmlBase(
      createHtmlStructure('<base href="' + href + '">'),
      url,
      { 'content-security-policy': [policy] },
      'utf-8',
    ).baseUrl;
  assert.equal(resolve('base-uri http:', 'https://files.test/'), 'https://files.test/');
  assert.equal(
    resolve('base-uri https://files.test.', 'https://files.test./'),
    'https://files.test./',
  );
  assert.equal(
    resolve('base-uri https://*.files.test.', 'https://a.files.test./'),
    'https://a.files.test./',
  );
  assert.equal(
    resolve("base-uri 'self'", 'https://example.test/files/', 'http://example.test/page'),
    'https://example.test/files/',
  );
  assert.equal(
    resolve('base-uri https://*.example.test:*/files/', 'https://a.example.test:8443/files/sub/'),
    'https://a.example.test:8443/files/sub/',
  );
  assert.equal(
    resolve('base-uri https://*.example.test', 'https://example.test/'),
    'https://example.test/page',
  );
  assert.equal(
    resolve('base-uri https://*.example.test', 'https://badexample.test/'),
    'https://example.test/page',
  );
  assert.equal(
    resolve('base-uri https://files.test', 'https://files.test:8443/'),
    'https://example.test/page',
  );
  assert.equal(
    resolve('base-uri https://files.test/%66iles/', 'https://files.test/files/a'),
    'https://files.test/files/a',
  );
  assert.equal(
    resolve('base-uri https://files.test/files', 'https://files.test/files/'),
    'https://example.test/page',
  );
  assert.equal(
    resolve('base-uri https://files.test/files/', 'https://files.test/files-other/'),
    'https://example.test/page',
  );
  assert.equal(
    resolve('base-uri https://files.test/A%2fb', 'https://files.test/A/b'),
    'https://example.test/page',
  );
  assert.equal(
    resolve('base-uri https://files.test/%FF', 'https://files.test/%ff'),
    'https://files.test/%ff',
  );
});
check('URL mechanics retain query order/path case and reject unsupported legacy queries', () => {
  const raw = ' ../Keep/report?b=2&a=1#fragment ',
    url = resolveHtmlUrl(raw, 'https://example.test/base/', 'utf-8');
  assert.equal(raw, ' ../Keep/report?b=2&a=1#fragment ');
  assert.equal(url.href, 'https://example.test/Keep/report?b=2&a=1#fragment');
  assert.equal(
    resolveHtmlUrl('/café', 'https://example.test/', 'windows-1252').href,
    'https://example.test/caf%C3%A9',
  );
  assert.throws(
    () => resolveHtmlUrl('/?q=café', 'https://example.test/', 'windows-1252'),
    /LEGACY_QUERY/,
  );
  assert.equal(resolveHtmlUrl('#?café', 'https://example.test/', 'windows-1252').search, '');
});
process.stdout.write('HTML charset/base: ' + passed + ' groups; native mechanics only.\n');
