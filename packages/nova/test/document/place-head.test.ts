import { describe, expect, it } from 'vitest';
import { placeHead } from '../../src/document';
import type { HeadElement } from '../../src/document';

// A screen's head elements, written into the document it was drawn into.

const TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="/favicon.svg" />
    <title>The site</title>
    <meta content="Everything about the site." name="description" />
    <link href='https://example.com/' rel='canonical'>
    <meta property="og:site_name" content="The site" />
    <meta property="og:title" content="The site" />
    <style>body { margin: 0 } /* <meta name="description" content="not a tag"> */</style>
  </head>
  <body>
    <div id="root"><h1>Drawn</h1></div>
  </body>
</html>
`;

const title = (text: string): HeadElement => ({ tag: 'title', attributes: {}, text });
const meta = (attributes: Record<string, string>): HeadElement => ({ tag: 'meta', attributes });
const link = (attributes: Record<string, string>): HeadElement => ({ tag: 'link', attributes });
const data = (value: unknown, attributes: Record<string, string> = { type: 'application/ld+json' }): HeadElement => ({ tag: 'script', attributes, text: JSON.stringify(value) });

const article: HeadElement[] = [
  title('Types & <tags>'),
  meta({ name: 'description', content: 'A "quoted" <lead>.' }),
  meta({ property: 'og:title', content: 'Types & <tags>' }),
  meta({ property: 'og:image:alt', content: 'A picture' }),
];

const headOf = (html: string): string => html.slice(html.indexOf('<head>'), html.indexOf('</head>'));

describe('placeHead — a head, in an HTML document', () => {
  it('with nothing to write, the document comes back untouched', () => {
    expect(placeHead(TEMPLATE, undefined)).toBe(TEMPLATE);
    expect(placeHead(TEMPLATE, [])).toBe(TEMPLATE);
    expect(placeHead(TEMPLATE, undefined, { path: '/articles/types/' })).toBe(TEMPLATE);
  });

  it('an element takes the place of the tag that said the same thing, whatever order that tag’s attributes were written in', () => {
    const html = placeHead(TEMPLATE, article);
    // where the document's own stood, marked as the screen's
    expect(html).toContain('<link rel="icon" href="/favicon.svg" />\n    <title data-nova-head>Types &amp; &lt;tags></title>\n    <meta name="description" content="A &quot;quoted&quot; &lt;lead>." data-nova-head>');
    expect(html).toContain('<meta property="og:title" content="Types &amp; &lt;tags>" data-nova-head>');
    expect(headOf(html).split('<template')[0]).not.toContain('Everything about the site.');
  });

  it('an element the document has no tag for is added after what is there, a line each', () => {
    const html = placeHead(TEMPLATE, article);
    expect(html).toContain('</style>\n    <meta property="og:image:alt" content="A picture" data-nova-head>\n    <template data-nova-own>');
  });

  it('keeps what gave up its place, inert, for the page to give back', () => {
    const html = placeHead(TEMPLATE, article);
    expect(html).toContain(
      '<template data-nova-own><title>The site</title><meta content="Everything about the site." name="description" /><meta property="og:title" content="The site" /></template>\n  </head>',
    );
  });

  it('leaves everything else exactly as it was', () => {
    const html = placeHead(TEMPLATE, article);
    for (const kept of ['<meta charset="UTF-8" />', '<link rel="icon" href="/favicon.svg" />', '<meta property="og:site_name" content="The site" />', '<div id="root"><h1>Drawn</h1></div>']) {
      expect(html).toContain(kept);
    }
    // a tag written inside a stylesheet is not a tag
    expect(html).toContain('/* <meta name="description" content="not a tag"> */');
    // with no site, where the document lives is not touched
    expect(html).toContain(`<link href='https://example.com/' rel='canonical'>`);
  });

  it('writes any attribute as it was given — nova keeps no list of them', () => {
    const html = placeHead(TEMPLATE, [
      meta({ name: 'made-up-tomorrow', content: 'yes', media: '(prefers-color-scheme: dark)' }),
      link({ rel: 'alternate', hreflang: 'de', href: '/de/' }),
      link({ rel: 'preconnect', href: 'https://cdn.example.net', crossorigin: '' }),
    ]);
    expect(html).toContain('<meta name="made-up-tomorrow" content="yes" media="(prefers-color-scheme: dark)" data-nova-head>');
    expect(html).toContain('<link rel="alternate" hreflang="de" href="/de/" data-nova-head>');
    // an attribute with no value is written bare
    expect(html).toContain('<link rel="preconnect" href="https://cdn.example.net" crossorigin data-nova-head>');
  });

  it('two that do not say the same thing stand side by side', () => {
    const html = placeHead(TEMPLATE, [link({ rel: 'alternate', hreflang: 'de', href: '/de/' }), link({ rel: 'alternate', hreflang: 'fr', href: '/fr/' }), link({ rel: 'icon', href: '/other.svg' })]);
    expect(html.match(/rel="alternate"/g)).toHaveLength(2);
    // an icon is not one of the things a document has only one of: the document's own stays
    expect(html).toContain('<link rel="icon" href="/favicon.svg" />');
    expect(html).toContain('<link rel="icon" href="/other.svg" data-nova-head>');
    expect(html).not.toContain('data-nova-own');
  });

  it('with a site, every path is given its own address — as the document’s own, head or no head', () => {
    const bare = placeHead(TEMPLATE, undefined, { site: 'https://example.com/', path: '/articles/types/?draft=1' });
    // unmarked: this is where the document lives, whatever its screen goes on to say
    expect(bare).toContain('<link rel="canonical" href="https://example.com/articles/types/">');
    expect(bare).toContain('<meta property="og:url" content="https://example.com/articles/types/">');
    expect(bare).not.toContain(`rel='canonical'`);
    expect(bare).not.toContain('data-nova-');
    // and nothing else moved
    expect(bare).toContain('<title>The site</title>');
  });

  it('a screen that says a canonical address of its own is taken at its word, and the document’s is kept for when it stops', () => {
    const html = placeHead(TEMPLATE, [link({ rel: 'canonical', href: 'https://example.com/the-one' })], { site: 'https://example.com', path: '/a-copy/' });
    expect(html).toContain('<link rel="canonical" href="https://example.com/the-one" data-nova-head>');
    expect(html).toContain('<template data-nova-own><link rel="canonical" href="https://example.com/a-copy/"></template>');
  });

  it('a data block is written as a script nothing inside can end', () => {
    const value = { '@type': 'Article', headline: '</script><script>alert(1)</script>', note: `line${String.fromCharCode(0x2028)}end` };
    const html = placeHead(TEMPLATE, [data(value)]);
    const script = /<script type="application\/ld\+json" data-nova-head>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
    expect(script).not.toContain('<');
    expect(script).toContain('\\u2028');
    expect(JSON.parse(script)).toEqual(value);
  });

  it('a data block stands beside the document’s own', () => {
    const withOwn = TEMPLATE.replace('</head>', '<script type="application/ld+json">{"@type":"Person"}</script>\n  </head>');
    const html = placeHead(withOwn, [data({ '@type': 'Article' })]);
    expect(html).toContain('{"@type":"Person"}');
    expect(html).toContain('{"@type":"Article"}');
  });

  it('a tag the document says twice is left said once, and both are kept', () => {
    const twice = TEMPLATE.replace('</head>', '<meta name="description" content="Said again.">\n  </head>');
    const html = placeHead(twice, [meta({ name: 'description', content: 'Once.' })]);
    expect(headOf(html).split('<template')[0]?.match(/name="description"/g)).toHaveLength(2); // the one written, and the one inside the stylesheet
    expect(html).toContain('<template data-nova-own><meta content="Everything about the site." name="description" /><meta name="description" content="Said again."></template>');
  });

  it('written again, a document is first put back as it was', () => {
    const once = placeHead(TEMPLATE, article);
    const twice = placeHead(once, [title('Another screen')]);
    // the first screen's elements are gone, the document's own are back, and only the title gave way
    expect(twice).toContain('<title data-nova-head>Another screen</title>');
    expect(twice).not.toContain('og:image:alt');
    expect(twice).toContain('<meta content="Everything about the site." name="description" />');
    expect(twice).toContain('<template data-nova-own><title>The site</title></template>');
    // and with nothing to say, it says what it always did
    const back = headOf(placeHead(once, undefined));
    for (const own of ['<title>The site</title>', '<meta content="Everything about the site." name="description" />', '<meta property="og:title" content="The site" />']) expect(back).toContain(own);
    expect(back).not.toContain('data-nova-');
  });

  it('a head written on one line stays on one line', () => {
    const oneLine = '<html><head><title>T</title></head><body></body></html>';
    expect(placeHead(oneLine, [meta({ name: 'robots', content: 'noindex' })])).toBe('<html><head><title>T</title><meta name="robots" content="noindex" data-nova-head></head><body></body></html>');
  });

  it('a document with no head is left alone', () => {
    expect(placeHead('<div id="root"></div>', article)).toBe('<div id="root"></div>');
  });

  it('nothing in what is written is read as a replacement pattern', () => {
    expect(placeHead(TEMPLATE, [title("$& $1 $'")])).toContain(`>$&amp; $1 $'</title>`);
  });
});
