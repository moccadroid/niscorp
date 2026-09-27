import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import { createUpgrader, type Sequence, type Upgrader } from '@niscorp/strata';
import { checkCorpus, type CorpusDocument, type GrammarSchema } from '@niscorp/strata/check';
import { NOVA_SCHEMAS, NOVA_SEQUENCE } from '@niscorp/nova/migrations';
import { PRISM_SCHEMAS, PRISM_SEQUENCE, prismTransform } from '@niscorp/prism/migrations';
import { Btn, Callout, Chip, Code, Grid, INK, Lead, MONO, Mono, Page, Panel, stampText } from '@showroom/chrome/stage/ui';

// ═══════════════════════════════════════════════════════════
// The gate — why "every document still opens" is a promise and not a hope.
//
// strata/corpus holds every screen the lab apps captured, written at older nova
// and Prism grammars. `pnpm check:grammars` upgrades each one to today and
// parses it with today's strict schemas; this page runs the same `checkCorpus`,
// in the browser, over the same files.
//
// The change being proposed is hypothetical — nova's layout `model` renamed to
// `bind` — and stands in for any rename. Its "new schema" is today's schema with
// that one key spelled differently. Everything else is real: the corpus, the
// grammars, the upgrader, the check.
// ═══════════════════════════════════════════════════════════

const CORPUS_FILES = import.meta.glob('../../../../../../strata/corpus/*/*.json', { import: 'default' });

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const loadCorpus = async (): Promise<CorpusDocument[]> => {
  const out: CorpusDocument[] = [];
  for (const [path, load] of Object.entries(CORPUS_FILES).sort(([a], [b]) => a.localeCompare(b))) {
    const raw: unknown = await load();
    const match = /corpus\/([^/]+)\/([^/]+)\.json$/.exec(path);
    if (!isRecord(raw) || !isRecord(raw['stamp']) || !Array.isArray(raw['documents']) || match === null) continue;
    const stamp = Object.fromEntries(Object.entries(raw['stamp']).map(([k, v]) => [k, Number(v)]));
    for (const doc of raw['documents']) {
      if (!isRecord(doc)) continue;
      out.push({ id: `${match[1]}/${match[2]}: ${String(doc['id'])}`, kind: String(doc['kind']), stamp, document: doc['document'] });
    }
  }
  return out;
};

const appOf = (id: string): string => id.split('/')[0] ?? id;

// ── the proposal ────────────────────────────────────────────────

const node = { $ref: '$.document' };
const renameModel = (to: string) => ({
  $case: {
    branches: [{ when: { $has: { from: node, path: ['model'] } }, then: { $renameKeys: { from: node, map: { model: to } } } }],
    else: node,
  },
});

const novaWith = (to: string): Sequence => ({
  ...NOVA_SEQUENCE,
  migrations: [...NOVA_SEQUENCE.migrations, { description: 'Layout: model → bind', steps: [{ kind: 'document', at: 'nisc.nova/layout', transform: renameModel(to) }] }],
});

type Path = readonly (string | number)[];

// Rename one key on the node at `path`, keeping its position; everything else untouched.
const renameAt = (value: unknown, path: Path, from: string, to: string): unknown => {
  if (path.length === 0) {
    return isRecord(value) ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k === from ? to : k, v])) : value;
  }
  const [head, ...rest] = path;
  if (Array.isArray(value) && typeof head === 'number') return value.map((v, i) => (i === head ? renameAt(v, rest, from, to) : v));
  if (isRecord(value) && typeof head === 'string') return { ...value, [head]: renameAt(value[head], rest, from, to) };
  return value;
};

// Today's schema for a kind, with a layout's `model` spelled `bind`: a layout
// still carrying `model` is refused the way a strict schema refuses any
// unknown key; one carrying `bind` is checked by today's schema as if it said
// `model`.
const proposedSchema = (kind: keyof typeof NOVA_SCHEMAS, locator: Upgrader): GrammarSchema => {
  const today = NOVA_SCHEMAS[kind]['~standard'];
  return {
    '~standard': {
      jsonSchema: today.jsonSchema,
      validate: async (value: unknown) => {
        const layouts = locator.locate(value, kind).filter((l) => l.kind === 'nisc.nova/layout');
        const stale = layouts.filter((l) => 'model' in l.value);
        if (stale.length > 0) return { issues: stale.map((l) => ({ message: 'Unrecognized key: "model" (a layout says "bind" now)', path: [...l.path, 'model'] })) };
        const asToday = layouts.filter((l) => 'bind' in l.value).reduce<unknown>((doc, l) => renameAt(doc, l.path, 'bind', 'model'), value);
        return today.validate(asToday);
      },
    },
  };
};

type Scenario = {
  id: string;
  label: string;
  what: string;
  migration?: unknown;
  build: (base: Upgrader) => Promise<{ upgrader: Upgrader; schemas: Readonly<Record<string, GrammarSchema>> }>;
};

const TODAY: Record<string, GrammarSchema> = { ...NOVA_SCHEMAS, ...PRISM_SCHEMAS };
const proposed = (base: Upgrader): Record<string, GrammarSchema> => ({
  ...PRISM_SCHEMAS,
  'nisc.nova/action': proposedSchema('nisc.nova/action', base),
  'nisc.nova/fragment': proposedSchema('nisc.nova/fragment', base),
  'nisc.nova/layout': proposedSchema('nisc.nova/layout', base),
});

const TODAY_SCENARIO: Scenario = {
  id: 'today',
  label: 'Today’s grammars',
  what: 'No change. Every captured screen, written at an older nova and Prism, upgraded to today and parsed by today’s strict schemas.',
  build: async (base) => ({ upgrader: base, schemas: TODAY }),
};

const SCENARIOS: readonly Scenario[] = [
  TODAY_SCENARIO,
  {
    id: 'no-migration',
    label: 'Rename model → bind, no migration',
    what: 'nova’s layout schema now says bind where it said model. Nothing tells the documents already written.',
    build: async (base) => ({ upgrader: base, schemas: proposed(base) }),
  },
  {
    id: 'typo',
    label: '…with a migration that has a typo',
    what: 'A migration is appended — but it renames model to binding.',
    migration: renameModel('binding'),
    build: async (base) => ({ upgrader: await createUpgrader([novaWith('binding'), PRISM_SEQUENCE], { transform: prismTransform }), schemas: proposed(base) }),
  },
  {
    id: 'right',
    label: '…with the right migration',
    what: 'One migration appended to nisc.nova: rename model to bind, on one layout node. strata walks every layout in every document.',
    migration: renameModel('bind'),
    build: async (base) => ({ upgrader: await createUpgrader([novaWith('bind'), PRISM_SEQUENCE], { transform: prismTransform }), schemas: proposed(base) }),
  },
];

type Verdict = { ok: true } | { ok: false; reason: string };

export const Gate: FC = () => {
  const [corpus, setCorpus] = useState<readonly CorpusDocument[]>([]);
  const [base, setBase] = useState<Upgrader>();
  const [scenarioId, setScenarioId] = useState('today');
  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? TODAY_SCENARIO;
  const [verdicts, setVerdicts] = useState<ReadonlyMap<string, Verdict>>(new Map());
  const [focus, setFocus] = useState<string>();
  const run = useRef(0);

  useEffect(() => {
    void (async () => {
      setBase(await createUpgrader([NOVA_SEQUENCE, PRISM_SEQUENCE], { transform: prismTransform }));
      setCorpus(await loadCorpus());
    })();
  }, []);

  // Check the corpus a few documents at a time, so the wall fills in as it goes
  // (a timer, not a frame: a hidden tab still finishes).
  useEffect(() => {
    if (base === undefined || corpus.length === 0) return;
    run.current += 1;
    const mine = run.current;
    setVerdicts(new Map());
    void (async () => {
      const { upgrader, schemas } = await scenario.build(base);
      const found = new Map<string, Verdict>();
      for (let i = 0; i < corpus.length; i += 6) {
        const batch = corpus.slice(i, i + 6);
        for (const doc of batch) {
          const report = await checkCorpus(upgrader, schemas, [doc]);
          const failure = report.failures[0];
          found.set(doc.id, failure === undefined ? { ok: true } : { ok: false, reason: failure.reason });
        }
        if (mine !== run.current) return;
        setVerdicts(new Map(found));
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
    })();
  }, [base, corpus, scenario]);

  const apps = useMemo(() => [...new Set(corpus.map((d) => appOf(d.id)))], [corpus]);
  const passed = [...verdicts.values()].filter((v) => v.ok).length;
  const failed = verdicts.size - passed;
  const done = corpus.length > 0 && verdicts.size === corpus.length;
  const bindings = useMemo(() => {
    if (base === undefined) return { nodes: 0, docs: 0 };
    let nodes = 0;
    let docs = 0;
    for (const d of corpus) {
      const n = base.locate(d.document, d.kind).filter((l) => l.kind === 'nisc.nova/layout' && 'model' in l.value).length;
      nodes += n;
      if (n > 0) docs += 1;
    }
    return { nodes, docs };
  }, [base, corpus]);
  const focused = corpus.find((d) => d.id === focus);
  const focusedVerdict = focus === undefined ? undefined : verdicts.get(focus);

  return (
    <Page>
      <Lead eyebrow="The gate" title="Change a grammar, and every screen ever captured tells you whether you broke it.">
        The promise “every document still opens” is checked, not hoped. <Mono>strata/corpus</Mono> holds {corpus.length || '…'} real screens from{' '}
        {apps.length || '…'} apps, written at older grammars. Before any grammar change lands, <Mono>pnpm check:grammars</Mono> upgrades every one to
        today and parses it with today’s strict schemas. This page runs the same check, on the same files, in your browser.
      </Lead>

      <Panel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {SCENARIOS.map((s) => (
            <Btn key={s.id} kind={s.id === scenario.id ? 'primary' : 'plain'} onClick={() => setScenarioId(s.id)}>
              {s.label}
            </Btn>
          ))}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.55 }}>{scenario.what}</div>
        {scenario.id !== 'today' && (
          <div style={{ fontSize: 12.5, color: INK.soft }}>
            A hypothetical change, standing in for any rename: the corpus holds <b>{bindings.nodes}</b> layouts that use <Mono>model</Mono>, in{' '}
            <b>{bindings.docs}</b> documents.
          </div>
        )}
        {scenario.migration !== undefined && <Code maxHeight={170}>{`// appended to nisc.nova — a document step at nisc.nova/layout\n${JSON.stringify(scenario.migration, null, 2)}`}</Code>}
      </Panel>

      <Panel
        tone={done ? (failed === 0 ? 'ok' : 'bad') : 'plain'}
        title={
          <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            The corpus
            {done ? (
              failed === 0 ? (
                <Chip tone="ok">✓ {passed}/{corpus.length} upgrade and parse</Chip>
              ) : (
                <Chip tone="bad">✕ {failed} of {corpus.length} would break</Chip>
              )
            ) : (
              <Chip tone="accent">
                checking {verdicts.size}/{corpus.length || '…'}
              </Chip>
            )}
          </span>
        }
        aside="click a screen"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {apps.map((app) => {
            const docs = corpus.filter((d) => appOf(d.id) === app);
            const first = docs[0];
            return (
              <div key={app} style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 650 }}>{app}</span>
                  <span style={{ fontSize: 11, color: INK.faint, fontFamily: MONO }}>{first === undefined ? '' : `written at ${stampText(first.stamp)}`}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {docs.map((d) => {
                    const v = verdicts.get(d.id);
                    const color = v === undefined ? '#e5e7eb' : v.ok ? '#10b981' : '#ef4444';
                    return (
                      <button
                        key={d.id}
                        type="button"
                        title={d.id}
                        onClick={() => setFocus(d.id)}
                        style={{
                          width: 20,
                          height: 26,
                          borderRadius: 4,
                          border: focus === d.id ? `2px solid ${INK.text}` : '1px solid rgba(0,0,0,0.06)',
                          background: color,
                          cursor: 'pointer',
                          transition: 'background 180ms',
                          padding: 0,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
          {corpus.length === 0 && <div style={{ color: INK.faint, fontSize: 13 }}>Loading the corpus…</div>}
        </div>
      </Panel>

      <Grid min={340}>
        <Panel title="pnpm check:grammars" aside="what CI prints">
          <Code maxHeight={260}>
            {!done
              ? '…'
              : failed === 0
                ? `[pass] corpus: ${passed}/${corpus.length} captured documents upgrade and parse`
                : [
                    `[fail] corpus: ${passed}/${corpus.length} captured documents upgrade and parse`,
                    ...[...verdicts.entries()]
                      .flatMap(([id, v]) => (v.ok ? [] : [`       ${id}: ${v.reason}`]))
                      .slice(0, 12),
                    failed > 12 ? `       … and ${failed - 12} more` : '',
                  ].join('\n')}
          </Code>
          <div style={{ fontSize: 12.5, color: INK.soft, lineHeight: 1.55 }}>
            The gate also compares each grammar’s JSON Schema against a recorded snapshot, so a schema that changes without a migration is refused
            even before the corpus runs.
          </div>
        </Panel>
        <Panel title={focused === undefined ? 'A screen' : focused.id} aside={focused?.kind}>
          {focused === undefined ? (
            <div style={{ fontSize: 13, color: INK.faint }}>Click any square to see which screen it is and what the check said.</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Chip mono>written at {stampText(focused.stamp)}</Chip>
                {focusedVerdict === undefined ? null : focusedVerdict.ok ? <Chip tone="ok">✓ upgrades and parses</Chip> : <Chip tone="bad">✕ breaks</Chip>}
              </div>
              {focusedVerdict?.ok === false && <div style={{ fontFamily: MONO, fontSize: 12, color: INK.bad, lineHeight: 1.5 }}>{focusedVerdict.reason}</div>}
              <Code maxHeight={220}>{JSON.stringify(focused.document, null, 2).slice(0, 4000)}</Code>
            </>
          )}
        </Panel>
      </Grid>

      <Callout tone="accent" title="Why this holds">
        A grammar change is a migration, or it does not merge. The migration is small — one node, one rename — and the corpus proves it against every
        real screen before anyone’s stored documents meet it. That is what lets the time machine promise that March’s screen still opens in October.
      </Callout>
    </Page>
  );
};
