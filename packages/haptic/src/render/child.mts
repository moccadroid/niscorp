// Runs in its own process under Node's permission model, with an empty environment. jsdom is imported by the absolute
// address the parent passes, so no package lookup outside the allowed folders happens. Reads { html, url, waitMs } on
// stdin, runs the page's inline scripts (jsdom loads no external files), waits for timers, writes the page on stdout.
type Dom = { serialize(): string };
type Jsdom = {
  JSDOM: new (html: string, options: object) => Dom;
  VirtualConsole: new () => object;
};

const jsdomUrl = process.argv[2];
if (!jsdomUrl) throw new Error('jsdom address missing');
const { JSDOM, VirtualConsole } = (await import(jsdomUrl)) as Jsdom;
const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
const { html, url, waitMs } = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
  html: string;
  url: string;
  waitMs: number;
};
const dom = new JSDOM(html, {
  url,
  runScripts: 'dangerously',
  virtualConsole: new VirtualConsole(),
});
await new Promise((resolve) => setTimeout(resolve, waitMs));
process.stdout.write(dom.serialize(), () => process.exit(0));
