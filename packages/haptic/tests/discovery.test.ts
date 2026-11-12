import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Calls } from '../src/discovery/calls.js';
import { discover } from '../src/discovery/discover.js';
import { labelRecords } from '../src/discovery/members.js';
import { textForRead } from '../src/discovery/sections.js';
import { buildLines, load, renderLines } from '../src/discovery/view.js';
import type { HttpSource } from '../src/web/source.js';

type Saved = {
  answers: Record<string, unknown>;
  sections: (string | null)[];
  members: (boolean | null)[];
};
type Fixture = {
  source: string;
  request: { url: string; instruction: string; allowLinkFollowing: boolean; linkDepth: number };
  pages: HttpSource[];
  attempts: Saved[];
  expect: {
    status: string;
    attempts: number;
    artifact: unknown;
    data: unknown;
    findings: string[];
  };
};

// Model calls answered from a saved pilot run: each saved answer must still pass the check discovery puts on it.
const replay = (saved: Saved | undefined): Calls => {
  if (!saved) throw new Error('discovery made an attempt the saved run did not make');
  const sections = [...saved.sections];
  const members = [...saved.members];
  return {
    event: () => {},
    jevLeft: () => Infinity,
    async agent(spec) {
      if (!(spec.job in saved.answers)) throw new Error(`no saved answer for ${spec.job}`);
      const data = saved.answers[spec.job] as never;
      if (data === null) return null;
      for (let i = 0; i < spec.steps; i++) if ((await spec.validate(data)) === null) return data;
      throw new Error(`the saved answer for ${spec.job} no longer passes its check`);
    },
    async decide(job, _state, questions) {
      const queue = job === 'section' ? sections : members;
      return Object.fromEntries(
        Object.keys(questions).map((name) => {
          if (!queue.length) throw new Error(`no saved ${job} decision`);
          return [name, queue.shift() ?? null];
        }),
      );
    },
  };
};

// Saved pilot runs: rendering and the mapping agent (Lua), Jev labels and a where phrase (Perl), a link stage
// (SQLite release notes), a second attempt at high effort (nginx).
for (const id of ['lua', 'perl', 'sqlite-release-notes', 'nginx-legacy-source-archives']) {
  const fixture = JSON.parse(
    readFileSync(new URL(`./fixtures/discovery/${id}.json`, import.meta.url), 'utf8'),
  ) as Fixture;
  const pages = new Map(fixture.pages.map((page) => [page.url, page]));
  const result = await discover(fixture.request, {
    groqKey: 'replay',
    pages: async (url) => pages.get(url) ?? assert.fail(`${id}: not a saved page: ${url}`),
    calls: (_effort, index) => replay(fixture.attempts[index]),
  });
  assert.equal(result.status, fixture.expect.status, `${id}: ${result.reason}`);
  assert.equal(result.attempts.length, fixture.expect.attempts, id);
  assert.deepEqual(result.artifact, fixture.expect.artifact, id);
  assert.deepEqual(result.data, fixture.expect.data, id);
  assert.deepEqual(result.findings, fixture.expect.findings, id);
}

// A text view over the budget: Read sees the section Jev picks, numbered as on the whole page.
const asked: { name: string; state: unknown }[] = [];
const picking = (choice: string | null): Calls => ({
  event: () => {},
  jevLeft: () => 1,
  agent: async () => null,
  decide: async (_job, state, questions) => {
    for (const name of Object.keys(questions)) asked.push({ name, state });
    return Object.fromEntries(Object.keys(questions).map((name) => [name, choice]));
  },
});
const long = load(
  `<body><p>${'intro '.repeat(20)}</p><h2>Fruit</h2><p>apple</p><p>pear</p><h2>Tools</h2><p>hammer</p><p>saw</p></body>`,
);
const lines = buildLines(long);
const text = await textForRead({
  lines,
  base: 'https://example.com/',
  instruction: 'list the tools',
  calls: picking('s3'),
  budget: 60,
});
assert.equal(text, '5 Tools\n6 hammer\n7 saw');
assert.equal(asked[0]?.name, 'section');
assert.deepEqual(Object.keys((asked[0]?.state as { sections: object }).sections), [
  's1',
  's2',
  's3',
]);
// Without an answer, the whole page cut at the budget.
const whole = renderLines(lines, 'https://example.com/');
assert.equal(
  await textForRead({
    lines,
    base: 'https://example.com/',
    instruction: 'list the tools',
    calls: picking(null),
    budget: 130,
  }),
  whole.slice(0, whole.lastIndexOf('\n', 130)),
);
assert.equal(
  await textForRead({
    lines,
    base: 'https://example.com/',
    instruction: 'list the tools',
    calls: picking(null),
    budget: 60,
  }),
  whole.slice(0, 60),
);

// More records to label than Jev questions left: no labels, so no where test is written from part of them.
const record = (name: string) => ({
  sourceUrl: 'https://example.com/',
  text: name,
  attributes: {},
  fields: { name },
});
const labels = await labelRecords({
  calls: picking(null),
  instruction: 'x',
  records: [record('a'), record('b'), record('c')],
  cited: new Set([0]),
  citedAll: false,
  concurrency: 2,
});
assert.equal(labels, null);

// Jev labels up to 25 records in one call, each record its own question named by its key in the state.
const sent: { records: string[]; questions: string[] }[] = [];
const batched = await labelRecords({
  calls: {
    event: () => {},
    jevLeft: () => 250,
    agent: async () => null,
    decide: async (_job, state, questions) => {
      const shown = (state as { records: Record<string, { text: string }> }).records;
      sent.push({ records: Object.keys(shown), questions: Object.keys(questions) });
      return Object.fromEntries(
        Object.keys(questions).map((key) => [key, shown[key]?.text !== 'x5']),
      );
    },
  },
  instruction: 'x',
  records: Array.from({ length: 31 }, (_, i) => record(`x${i}`)),
  cited: new Set([0]),
  citedAll: false,
  concurrency: 2,
});
assert.deepEqual(
  sent.map((call) => call.questions.length),
  [25, 5],
);
assert.ok(sent.every((call) => call.records.join() === call.questions.join()));
assert.deepEqual(
  batched?.filter((label) => !label.keep).map((label) => label.index),
  [5],
);

console.log('discovery: four saved runs replayed, sections, Jev cap, Jev batches');
