import { describe, expect, it } from 'vitest';
import { placeHead } from '../../src/document';

// A screen's head, written into the document it was drawn into.

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

const article = { title: 'Types & <tags>', description: 'A "quoted" <lead>.', image: '/covers/types.png', kind: 'article' as const };

describe('placeHead — a head, in an HTML document', () => {
  it('with no head and no site, the document comes back untouched', () => {
    expect(placeHead(TEMPLATE, undefined)).toBe(TEMPLATE);
    expect(placeHead(TEMPLATE, {})).toBe(TEMPLATE);
    expect(placeHead(TEMPLATE, undefined, { path: '/articles/types/' })).toBe(TEMPLATE);
  });

  it('what the head says takes the place of the tag that said it, whatever order its attributes were written in', () => {
    const html = placeHead(TEMPLATE, article);
    expect(html).toContain('<title data-own="The site">Types &amp; &lt;tags></title>');
    expect(html).toContain('<meta name="description" content="A &quot;quoted&quot; &lt;lead>.">');
    expect(html).not.toContain('Everything about the site.');
    expect(html).toContain('<meta property="og:title" content="Types &amp; &lt;tags>">');
    expect(html.match(/og:title/g)).toHaveLength(1);
  });

  it('a tag the document does not have yet is added before </head>', () => {
    const html = placeHead(TEMPLATE, article);
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head).toContain('<meta property="og:description" content="A &quot;quoted&quot; &lt;lead>.">');
    expect(head).toContain('<meta property="og:type" content="article">');
    expect(head).toContain('<meta property="og:image" content="/covers/types.png">');
  });

  it('what is added sits a line each, indented as the head is — or straight on, in a head on one line', () => {
    expect(placeHead(TEMPLATE, { kind: 'article' })).toContain('</style>\n    <meta property="og:type" content="article">\n  </head>');
    const oneLine = '<html><head><title>T</title></head><body></body></html>';
    expect(placeHead(oneLine, { kind: 'article' })).toBe('<html><head><title>T</title><meta property="og:type" content="article"></head><body></body></html>');
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

  it('with a site, every path is given its own address — head or no head', () => {
    const bare = placeHead(TEMPLATE, undefined, { site: 'https://example.com/', path: '/articles/types/?draft=1' });
    expect(bare).toContain('<link rel="canonical" href="https://example.com/articles/types/">');
    expect(bare).not.toContain(`rel='canonical'`);
    expect(bare).toContain('<meta property="og:url" content="https://example.com/articles/types/">');
    // and nothing else moved
    expect(bare).toContain('<title>The site</title>');
  });

  it('with a site, a picture’s address is made whole', () => {
    const at = { site: 'https://example.com', path: '/articles/types/' };
    expect(placeHead(TEMPLATE, article, at)).toContain('<meta property="og:image" content="https://example.com/covers/types.png">');
    expect(placeHead(TEMPLATE, { image: 'cover.png' }, at)).toContain('content="https://example.com/articles/types/cover.png"');
    expect(placeHead(TEMPLATE, { image: 'https://cdn.example.net/c.png' }, at)).toContain('content="https://cdn.example.net/c.png"');
  });

  it('structured data is written as a script nothing inside can end', () => {
    const html = placeHead(TEMPLATE, { structured: { '@type': 'Article', headline: '</script><script>alert(1)</script>', note: `line${String.fromCharCode(0x2028)}end` } });
    const script = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
    expect(script).not.toContain('<');
    expect(script).toContain('\\u2028');
    expect(JSON.parse(script)).toEqual({ '@type': 'Article', headline: '</script><script>alert(1)</script>', note: `line${String.fromCharCode(0x2028)}end` });
  });

  it('structured data takes the place of the document’s own', () => {
    const withOwn = TEMPLATE.replace('</head>', '<script type="application/ld+json">{"@type":"Person"}</script>\n  </head>');
    const html = placeHead(withOwn, { structured: [{ '@type': 'Article' }] });
    expect(html).not.toContain('"Person"');
    expect(html.match(/application\/ld\+json/g)).toHaveLength(1);
  });

  it('a tag said twice is left said once', () => {
    const twice = TEMPLATE.replace('</head>', '<meta name="description" content="Said again.">\n  </head>');
    const html = placeHead(twice, { description: 'Once.' });
    expect(html.match(/name="description"/g)).toHaveLength(2); // the one written, and the one inside the stylesheet
    expect(html).not.toContain('Said again.');
  });

  it('written twice, a document still knows its own title', () => {
    const once = placeHead(TEMPLATE, { title: 'First' });
    expect(placeHead(once, { title: 'Second' })).toContain('<title data-own="The site">Second</title>');
    // the same title as the document's own needs no keeping
    expect(placeHead(TEMPLATE, { title: 'The site' })).toContain('<title>The site</title>');
  });

  it('a document with no head is left alone', () => {
    expect(placeHead('<div id="root"></div>', article)).toBe('<div id="root"></div>');
  });

  it('nothing in what is written is read as a replacement pattern', () => {
    expect(placeHead(TEMPLATE, { title: "$& $1 $'" })).toContain(`>$&amp; $1 $'</title>`);
  });
});
