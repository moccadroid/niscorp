import assert from 'node:assert/strict';
import { test } from 'node:test';
import { qualifyResult } from './qualification-support.mjs';

const exact = (value, role) => ({ kind: 'exact', value, ...(role ? { role } : {}) });
const url = (value, role) => ({ kind: 'url', value, ...(role ? { role } : {}) });
const news = {
  kind: 'records',
  baseUrl: 'https://source.invalid',
  sourceHashes: ['independent-source-hash'],
  ordered: true,
  roles: {
    headline: { keys: ['dynamicTitle'] },
    url: { keys: ['dynamicUrl'] },
    description: { keys: ['dynamicSummary'] },
  },
  expected: [
    {
      id: 'first',
      identity: [exact('First headline', 'headline'), url('https://source.invalid/one', 'url')],
      details: [exact('First description', 'description')],
    },
    {
      id: 'second',
      identity: [exact('Second headline', 'headline'), url('https://source.invalid/two', 'url')],
      details: [],
    },
  ],
};
const rows = [
  { dynamicTitle: 'First headline', dynamicUrl: '/one', dynamicSummary: 'First description' },
  { dynamicTitle: 'Second headline', dynamicUrl: '/two', dynamicSummary: null },
];
const grade = (contract, data, extra = {}) =>
  qualifyResult({
    contract,
    artifact: {},
    execution: { status: 'completed', value: { data } },
    ...extra,
  });

test('provider blocking without an artifact is not an extraction-quality failure', () => {
  const blocked = {
    kind: 'provider',
    status: 429,
    code: 'PROVIDER_RATE_LIMITED',
    message: 'Quota exhausted',
    retryAfterMs: 1000,
  };
  const result = qualifyResult({ artifact: null, blocked });
  assert.equal(result.classification, null);
  assert.equal(result.scorable, false);
  assert.equal(result.operational, 'blocked');
  assert.deepEqual(result.blocked, blocked);
});

test('a working artifact is still graded when its reviewer was provider-blocked', () => {
  const blocked = {
    kind: 'provider',
    status: 429,
    code: 'PROVIDER_RATE_LIMITED',
    message: 'Quota exhausted',
    retryAfterMs: 1000,
  };
  assert.equal(grade(news, rows, { blocked }).classification, 'complete');
  assert.equal(
    grade(news, [{ ...rows[0], dynamicUrl: '/wrong' }], { blocked }).classification,
    'unusable',
  );
});

test('qualification preserves dynamic fields, associations, source-absent descriptions and useful partials', () => {
  assert.equal(grade(news, rows).classification, 'complete');
  assert.equal(grade(news, rows.slice(0, 1)).classification, 'useful-partial');
  assert.equal(
    grade(
      news,
      rows.map(({ dynamicSummary, ...row }) => row),
    ).classification,
    'useful-partial',
  );
  assert.equal(grade(news, [rows[1], rows[0]]).classification, 'useful-partial');
});

test('qualification rejects swapped article links and whole-page blobs despite positive review', () => {
  const review = { decision: { accepted: true, reason: 'Everything is correct' } };
  const swapped = rows.map((row, index) => ({ ...row, dynamicUrl: rows[1 - index].dynamicUrl }));
  assert.equal(grade(news, swapped, { review }).classification, 'unusable');
  assert(grade(news, swapped, { review }).falseAcceptance);
  assert.equal(grade(news, [{ text: rows.flatMap(Object.values).join(' ') }]).classification, null);
  assert.equal(grade(news, { one: rows[0], two: rows[1] }).classification, 'complete');
});

test('qualification never turns SQLite placeholder labels into archive identity', () => {
  const contract = {
    kind: 'values',
    baseUrl: 'https://sqlite.org',
    sourceHashes: ['hash'],
    valueFields: ['href'],
    metadataKeys: ['label'],
    expected: [
      {
        id: 'linux',
        identity: [url('https://sqlite.org/2026/sqlite-tools-linux-x64-3540100.zip')],
      },
    ],
  };
  assert.equal(
    grade(contract, [
      { label: 'sqlite-tools-linux-x64-3540100.zip', href: 'https://sqlite.org/hp1.html' },
    ]).classification,
    'unusable',
  );
  assert.equal(
    grade(contract, ['https://sqlite.org/2026/sqlite-tools-linux-x64-3540100.zip']).classification,
    'complete',
  );
});

test('qualification reports missing timetable notes without hiding correct classes', () => {
  const contract = {
    kind: 'records',
    baseUrl: 'https://source.invalid',
    sourceHashes: ['hash'],
    roles: {
      day: { keys: [], contextLabels: ['MONDAY'] },
      time: { keys: ['time'] },
      title: { keys: ['name'] },
      notes: { keys: ['note'] },
    },
    expected: [
      {
        id: 'class',
        identity: [exact('MONDAY', 'day'), exact('18:00', 'time'), exact('Dance', 'title')],
        details: [exact('Cancelled', 'notes')],
      },
    ],
  };
  assert.equal(
    grade(contract, { MONDAY: [{ time: '18:00', name: 'Dance', note: 'Cancelled' }] })
      .classification,
    'complete',
  );
  const partial = grade(
    contract,
    { MONDAY: [{ time: '18:00', name: 'Dance' }] },
    { review: { decision: { accepted: true } } },
  );
  assert.equal(partial.classification, 'useful-partial');
  assert.equal(partial.falseAcceptance, false);
  assert(partial.reviewReasonAuditRequired);
});

test('qualification keeps absent artifacts unresolved and genuine empty results complete', () => {
  assert.equal(
    qualifyResult({
      contract: news,
      artifact: null,
      execution: { status: 'completed', value: { data: rows } },
    }).classification,
    'unresolved',
  );
  const empty = { ...news, expected: [] };
  assert.equal(grade(empty, []).classification, 'complete');
  assert.equal(grade(empty, [{ arbitrary: 'Wrong data' }]).scorable, false);
  assert.equal(grade(news, []).classification, 'unusable');
});

test('qualification checks price and currency together, without any field names in the library', () => {
  const contract = {
    kind: 'records',
    baseUrl: 'https://source.invalid',
    sourceHashes: ['hash'],
    roles: { price: { keys: ['anything'] }, currency: { keys: ['denomination'] } },
    expected: [
      {
        id: 'offer',
        identity: [{ kind: 'number', value: 7.99, role: 'price' }, exact('EUR', 'currency')],
      },
    ],
  };
  assert.equal(
    grade(contract, { anything: '7,99€', denomination: 'EUR' }).classification,
    'complete',
  );
  assert.equal(grade(contract, { anything: 0.99, denomination: 'EUR' }).classification, 'unusable');
  assert.equal(grade(contract, { anything: 7.99, denomination: 'USD' }).classification, 'unusable');
});

test('news pool accepts different valid selections without inventing universal importance', () => {
  const pool = { ...news, targetCount: 1, ordered: false, checkAllValues: true };
  assert.equal(grade(pool, [rows[0]]).classification, 'complete');
  assert.equal(grade(pool, [rows[1]]).classification, 'complete');
  const wrong = grade(pool, [{ ...rows[1], dynamicSummary: 'Invented description' }], {
    review: { decision: { accepted: true } },
  });
  assert.equal(wrong.classification, 'useful-partial');
  assert(wrong.falseAcceptance);
});

test('source-derived headline aliases allow kicker punctuation without matching arbitrary blobs', () => {
  const contract = {
    kind: 'records',
    baseUrl: 'https://source.invalid',
    sourceHashes: ['hash'],
    roles: { headline: { keys: ['title'] }, url: { keys: ['href'] } },
    expected: [
      {
        id: 'one',
        identity: [
          {
            kind: 'headline',
            value: 'Actual headline',
            aliases: ['ContextActual headline'],
            role: 'headline',
          },
          url('https://source.invalid/one', 'url'),
        ],
      },
    ],
  };
  assert.equal(
    grade(contract, [{ title: 'Context: Actual headline', href: '/one' }]).classification,
    'complete',
  );
  assert.equal(
    grade(contract, [{ title: 'Unrelated text Actual headline', href: '/one' }]).classification,
    'unusable',
  );
});

test('nested scalar change lists retain their article association', () => {
  const contract = {
    kind: 'records',
    baseUrl: 'https://source.invalid',
    sourceHashes: ['hash'],
    roles: { heading: { keys: ['heading'] }, changes: { keys: ['changes'] } },
    expected: [
      {
        id: 'one',
        identity: [exact('Release One', 'heading')],
        details: [{ kind: 'contains', value: 'First change Second change', role: 'changes' }],
      },
    ],
  };
  assert.equal(
    grade(contract, [{ heading: 'Release One', changes: [['First change', 'Second change']] }])
      .classification,
    'complete',
  );
  assert.equal(
    grade(contract, [{ heading: 'Another release', changes: [['First change', 'Second change']] }])
      .classification,
    'unusable',
  );
});

test('caller headline and intro roles reject within-record swaps rather than searching all values', () => {
  const contract = {
    ...news,
    roles: {
      headline: { keys: ['headline'] },
      description: { keys: ['intro'] },
      url: { keys: ['url'] },
    },
  };
  const correct = rows.map((row) => ({
    headline: row.dynamicTitle,
    intro: row.dynamicSummary,
    url: row.dynamicUrl,
  }));
  assert.equal(grade(contract, correct).classification, 'complete');
  const swapped = correct.map((row) => ({ ...row, headline: row.intro, intro: row.headline }));
  assert.equal(grade(contract, swapped).classification, 'unusable');
  const oneSwapped = [
    { ...correct[0], headline: correct[0].intro, intro: correct[0].headline },
    correct[1],
  ];
  assert.equal(grade(contract, oneSwapped).classification, 'useful-partial');
});

test('unknown role meanings are explicitly unscorable, never bag-complete', () => {
  const result = grade(news, [{ a: 'First headline', b: '/one', c: 'First description' }]);
  assert.equal(result.classification, null);
  assert.equal(result.scorable, false);
  assert.equal(
    grade(
      news,
      rows.map((row) => ({ ...row, unknownSemanticField: 'unverified' })),
    ).scorable,
    false,
  );
  const noRoles = { ...news };
  delete noRoles.roles;
  assert.equal(grade(noRoles, rows).scorable, false);
  const ambiguous = {
    ...news,
    roles: { ...news.roles, headline: { keys: ['dynamicTitle', 'title'] } },
  };
  assert.equal(
    grade(
      ambiguous,
      rows.map((row) => ({ ...row, title: row.dynamicTitle })),
    ).scorable,
    false,
  );
});

test('one result per target rejects duplicate links and stray scalar text, preserving labels and metadata', () => {
  const contract = {
    kind: 'values',
    baseUrl: 'https://source.invalid',
    sourceHashes: ['hash'],
    uniqueResults: true,
    valueFields: ['href'],
    metadataKeys: ['label', 'metadata'],
    expected: [{ id: 'book', identity: [url('https://source.invalid/book')] }],
  };
  const review = { decision: { accepted: true } };
  for (const values of [
    ['/book', '/book'],
    ['/book', 'not a requested result'],
  ]) {
    const result = grade(contract, values, { review });
    assert.equal(result.classification, 'useful-partial');
    assert(result.falseAcceptance);
  }
  assert.equal(
    grade(contract, [{ href: '/book', label: 'A valid book', metadata: 'Edition 2' }])
      .classification,
    'complete',
  );
  assert.equal(grade(contract, [{ unknownUrl: '/book', label: 'A valid book' }]).scorable, false);
  assert.equal(
    grade(contract, [{ href: '/book', unknownSemanticField: 'unverified' }]).scorable,
    false,
  );
});

test('fixed result cardinality rejects duplicate or extra release dates without inventing request fields', () => {
  const contract = {
    kind: 'values',
    baseUrl: 'https://source.invalid',
    sourceHashes: ['hash'],
    maximumCount: 2,
    uniqueResults: true,
    expected: [
      { id: 'one', identity: [exact('Nov 1 2026')] },
      { id: 'two', identity: [exact('Oct 1 2026')] },
    ],
  };
  assert.equal(grade(contract, ['Nov 1 2026', 'Oct 1 2026']).classification, 'complete');
  const duplicate = grade(contract, ['Nov 1 2026', 'Oct 1 2026', 'Oct 1 2026']);
  assert.equal(duplicate.classification, 'useful-partial');
  assert(duplicate.cardinalityViolated);
  assert.equal(
    grade(contract, ['Nov 1 2026', 'Oct 1 2026', 'wrong date']).unmatchedValues.length,
    1,
  );
});

test('status role and component identity cannot trade places or borrow arbitrary parent values', () => {
  const contract = {
    kind: 'records',
    baseUrl: 'https://source.invalid',
    sourceHashes: ['hash'],
    roles: { component: { keys: ['name'] }, status: { keys: ['status'] } },
    expected: [
      { id: 'actions', identity: [exact('Actions', 'component'), exact('operational', 'status')] },
    ],
  };
  assert.equal(
    grade(contract, [{ name: 'Actions', status: 'operational' }]).classification,
    'complete',
  );
  assert.equal(
    grade(contract, [{ name: 'operational', status: 'Actions' }]).classification,
    'unusable',
  );
  assert.equal(
    grade(contract, { name: 'Actions', children: [{ status: 'operational' }] }).scorable,
    false,
  );
});

test('semantic fields are checked by their own role while declared harmless metadata is allowed', () => {
  const contract = { ...news, checkAllValues: true, metadataKeys: ['category', 'metadata'] };
  assert.equal(
    grade(
      contract,
      rows.map((row) => ({ ...row, category: 'General news' })),
    ).classification,
    'complete',
  );
  assert.equal(
    grade(
      contract,
      rows.map((row) => ({ ...row, metadata: { author: 'An author', tags: ['news'] } })),
    ).classification,
    'complete',
  );
  assert.equal(
    grade(
      contract,
      rows.map((row) => ({ ...row, unknownNested: { text: 'Unverified semantic value' } })),
    ).scorable,
    false,
  );
  const wrong = grade(contract, [{ ...rows[0], dynamicSummary: rows[0].dynamicTitle }, rows[1]], {
    review: { decision: { accepted: true } },
  });
  assert.equal(wrong.classification, 'useful-partial');
  assert(wrong.unsupportedValues.some((value) => value.role === 'description'));
  assert(wrong.falseAcceptance);
});

test('contradictory parent semantic fields cannot disappear behind a correct nested record', () => {
  const contract = { ...news, expected: [news.expected[0]] };
  const hidden = {
    dynamicTitle: 'Wrong headline',
    dynamicUrl: '/one',
    dynamicSummary: 'Wrong description',
    details: rows[0],
  };
  assert.equal(grade(contract, hidden).scorable, false);
  assert.equal(grade(contract, { wrapper: [rows[0]] }).classification, 'complete');
  const grouped = {
    kind: 'records',
    baseUrl: 'https://source.invalid',
    sourceHashes: ['hash'],
    roles: { day: { keys: ['day'], inherit: true }, title: { keys: ['title'] } },
    expected: [{ id: 'class', identity: [exact('MONDAY', 'day'), exact('Dance', 'title')] }],
  };
  assert.equal(
    grade(grouped, { day: 'MONDAY', classes: [{ title: 'Dance' }] }).classification,
    'complete',
  );
});
