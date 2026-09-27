import { useCallback, useEffect, useState, type FC, type ReactNode } from 'react';
import { PhoneStyles } from '@showroom/chrome/stage/phone';
import { Btn, Callout, Chip, Grid, INK, Lead, Mono, Page, Panel } from '@showroom/chrome/stage/ui';
import { getLiveConfig, hasGenerationKey } from '../runtime/live-config';
import { AnswerPhone, Block, Label, json, prettySql } from '../parts';
import { CLASS_NAMES, getStudio, QUESTIONS, type Asked, type Question } from '../world/studio';

// ═══════════════════════════════════════════════════════════
// What vex is for — the landing page.
//
// Olivia, who owns Acme Studio, asks her studio's database a question in
// English. The page shows every step it takes to become an answer on her
// phone: the question, the DSL (vex's small JSON query), the SQL vex compiles
// from it, and the one call the app actually makes.
//
// Real: Postgres in the page, the vex engine, the compiler, the Prism mapping,
// the cache replay — see world/studio.ts. Authored: the studio's rows and the
// DSL stored for each question (written by hand, as a seed entry). With a model
// key set, "Ask a model" really asks one and the page says which.
// ═══════════════════════════════════════════════════════════

const href = (path: string): string => `${import.meta.env.BASE_URL}vex/${path}`;

const Word: FC<{ word: string; children: ReactNode }> = ({ word, children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', gap: 12, padding: '10px 0', borderTop: `1px solid ${INK.line}`, fontSize: 13.5, lineHeight: 1.55 }}>
    <div style={{ fontWeight: 700 }}>{word}</div>
    <div style={{ color: INK.soft }}>{children}</div>
  </div>
);

const Next: FC<{ to: string; title: string; children: ReactNode; n: number }> = ({ to, title, children, n }) => (
  <a href={href(to)} style={{ textDecoration: 'none', color: 'inherit', border: `1px solid ${INK.line}`, borderRadius: 14, padding: 16, display: 'flex', gap: 14, background: '#fff' }}>
    <div style={{ fontSize: 22, fontWeight: 800, color: INK.accent, lineHeight: 1 }}>{n}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 14.5, fontWeight: 700 }}>{title} →</div>
      <div style={{ fontSize: 13, color: INK.soft, lineHeight: 1.5 }}>{children}</div>
    </div>
  </a>
);

const Step: FC<{ n: number; title: string; aside?: ReactNode; children: ReactNode }> = ({ n, title, aside, children }) => (
  <div style={{ display: 'flex', gap: 12 }}>
    <div
      style={{
        flex: '0 0 auto',
        width: 24,
        height: 24,
        borderRadius: 999,
        background: INK.accentWash,
        color: INK.accent,
        fontSize: 12,
        fontWeight: 750,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      {n}
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
      <Label aside={aside}>{title}</Label>
      {children}
    </div>
  </div>
);

const Way: FC<{ tone: 'bad' | 'ok'; title: string; children: ReactNode }> = ({ tone, title, children }) => (
  <div
    style={{
      borderRadius: 12,
      padding: 14,
      background: tone === 'ok' ? INK.okWash : INK.badWash,
      border: `1px solid ${tone === 'ok' ? '#a7f3d0' : '#fecaca'}`,
      fontSize: 13.5,
      lineHeight: 1.55,
    }}
  >
    <b style={{ color: tone === 'ok' ? INK.ok : INK.bad }}>{title}</b> {children}
  </div>
);

// The roster question carries the picked class; the others carry what they were seeded with.
const contextFor = (question: Question | undefined, className: string): Record<string, unknown> =>
  question !== undefined && 'className' in question.context ? { className } : (question?.context ?? {});

export const Intro: FC = () => {
  const [picked, setPicked] = useState(0);
  const [className, setClassName] = useState(CLASS_NAMES[0] ?? 'Morning flow');
  const [asked, setAsked] = useState<Asked>();
  const [busy, setBusy] = useState(false);
  const [bootError, setBootError] = useState<string>();
  const keyAvailable = hasGenerationKey();
  const question: Question | undefined = QUESTIONS[picked];
  const context = contextFor(question, className);

  const ask = useCallback(
    async (live: boolean): Promise<void> => {
      const q = QUESTIONS[picked];
      if (q === undefined) return;
      setBusy(true);
      try {
        const studio = await getStudio();
        setAsked(await studio.ask(q, contextFor(q, className), live));
      } catch (err) {
        setBootError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [picked, className],
  );

  // Every change of question or value re-asks by replay — instant, no model.
  useEffect(() => {
    void ask(false);
  }, [ask]);

  const live = getLiveConfig();
  const source =
    asked === undefined ? undefined : asked.source === 'generated' ? (
      <Chip tone="warn">written just now by {live.provider}/{live.model}</Chip>
    ) : (
      <Chip tone="ok">stored entry · no model call</Chip>
    );

  return (
    <Page>
      <PhoneStyles />
      <Lead eyebrow="vex" title="Ask the database in plain words once. After that, the app asks by name — no model, no SQL on the wire.">
        Olivia owns Acme Studio. She wants to know how full her classes are. Somebody — a model, or a developer — turns that question into a small JSON
        query called the <b>DSL</b>. Vex checks it, compiles it to SQL itself, runs it and shapes the answer for the screen. Then it stores the DSL under a
        name, so from then on her app sends only the name and the values that change.
      </Lead>

      <Panel title="The problem, in one picture" aside="three ways to answer Olivia’s question">
        <Grid min={260} gap={12}>
          <Way tone="bad" title="An endpoint per question.">
            Somebody writes, reviews and deploys code every time the owner is curious. The question waits for a developer.
          </Way>
          <Way tone="bad" title="A model that writes SQL.">
            A new query every ask, a model call every ask, and nothing stops it reading a table it shouldn’t — or writing one.
          </Way>
          <Way tone="ok" title="Vex.">
            The model writes a DSL that can only say safe things. Vex writes the SQL, adds the access rules the model never sees, and keeps the DSL under a
            name. The next ask is a replay: no model, milliseconds.
          </Way>
        </Grid>
      </Panel>

      <Panel title="Olivia asks" aside={<Chip tone="accent">real vex engine · Postgres in this page</Chip>}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {QUESTIONS.map((x, i) => (
            <Btn key={x.entry.fingerprint} kind={i === picked ? 'primary' : 'plain'} onClick={() => setPicked(i)}>
              “{x.entry.intent}”
            </Btn>
          ))}
        </div>
        {question !== undefined && 'className' in question.context && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, color: INK.soft, marginRight: 4 }}>Which class:</span>
            {CLASS_NAMES.map((n) => (
              <Btn key={n} kind={n === className ? 'primary' : 'quiet'} onClick={() => setClassName(n)}>
                {n}
              </Btn>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', borderTop: `1px solid ${INK.line}`, paddingTop: 12 }}>
          <Btn onClick={() => void ask(false)} disabled={busy}>
            Ask again (replay)
          </Btn>
          <Btn
            onClick={() => void ask(true)}
            disabled={busy || !keyAvailable}
            title={keyAvailable ? 'Empties a fresh slot and asks the model to write the DSL' : 'Needs a model key — set one in Signal → Settings'}
          >
            Ask a model fresh
          </Btn>
          <span style={{ fontSize: 12.5, color: INK.soft }}>
            {keyAvailable
              ? `A fresh ask goes to ${live.provider}/${live.model}; the stored entry is left alone.`
              : 'No model key is set, so every answer here is a replay of the stored entry. Set a key in Signal → Settings to ask a model.'}
          </span>
        </div>
      </Panel>

      {bootError !== undefined && <Callout tone="bad" title="The studio database did not start">{bootError}</Callout>}

      {question !== undefined && (
        <Grid min={340} gap={16}>
          <Panel title="What happens" aside={asked !== undefined ? `${Math.max(1, Math.round(asked.ms))} ms` : busy ? 'asking…' : undefined}>
            <Step n={1} title="The question, in English">
              <div style={{ fontSize: 15, fontStyle: 'italic' }}>“{question.entry.intent}”</div>
            </Step>
            <Step n={2} title="The DSL — a query as JSON" aside={source}>
              <Block maxHeight={260}>{json(asked?.dsl ?? question.entry.dsl)}</Block>
            </Step>
            <Step n={3} title="The SQL vex compiled from it" aside={<Chip>parameterized · never from the model</Chip>}>
              {asked?.error !== undefined ? <Block tone="bad">{asked.error}</Block> : <Block maxHeight={200}>{asked?.sql !== undefined ? prettySql(asked.sql) : '…'}</Block>}
            </Step>
            <Step n={4} title="What Olivia’s app sends, every time after the first">
              <Block>{json({ fingerprint: question.entry.fingerprint, context })}</Block>
            </Step>
          </Panel>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 8 }}>
            <AnswerPhone
              title={question.screen}
              question={question.entry.intent}
              value={asked?.answer ?? []}
              tone={asked === undefined ? 'plain' : asked.ok ? 'ok' : 'bad'}
              status="Olivia"
              footer={
                asked?.rowCount !== undefined ? (
                  <div style={{ fontSize: 11, color: INK.faint }}>
                    {asked.rowCount} row{asked.rowCount === 1 ? '' : 's'} from Postgres, shaped by the entry’s mapping
                  </div>
                ) : undefined
              }
            />
            <div style={{ fontSize: 12.5, color: INK.soft, textAlign: 'center', maxWidth: 300, lineHeight: 1.5 }}>
              The answer arrives already shaped for the screen: “5 of 6 booked”, “€ 579,00”. The phone formats nothing.
            </div>
          </div>
        </Grid>
      )}

      <Panel title="Five words">
        <div>
          <Word word="Intent">The question in plain words. It is how a query is asked the first time, and how it is described after.</Word>
          <Word word="DSL">
            Vex’s query language, as JSON: <Mono>from</Mono>, <Mono>fields</Mono>, <Mono>filter</Mono>, <Mono>sort</Mono>. It names tables and columns
            that exist and nothing else — there is no way to spell <Mono>DROP</Mono> in it.
          </Word>
          <Word word="Fingerprint">The name a query is stored under. The app sends the name; the DSL stays on the server.</Word>
          <Word word="Context">The values that change between asks — which class. Data, not identity: a new class reuses the same stored query.</Word>
          <Word word="Scope">Access rules vex adds to every query on the server, from who is asking. The model never sees them and cannot undo them.</Word>
        </div>
      </Panel>

      <Grid min={280} gap={12}>
        <Callout tone="accent" title="Why a DSL and not SQL">
          A model that writes SQL can write any SQL. A DSL can only describe a read over the schema vex introspected — and vex, not the model, decides
          what SQL that becomes, with every value passed as a parameter.
        </Callout>
        <Callout tone="accent" title="Why store it under a name">
          The first ask is slow and costs a model call. Every ask after is a replay: the same checked query, new values, milliseconds. A locked app
          accepts only names — nothing it has not seen before can run.
        </Callout>
      </Grid>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Walk through it</div>
        <Grid min={320} gap={12}>
          <Next n={1} to="basics/top-customers" title="One ask, every stage">
            Question, cache, DSL, SQL, rows, shape — each stage lights up as the real engine reaches it.
          </Next>
          <Next n={2} to="caching/fingerprint-replay" title="The published endpoint">
            The wire carries a name and values. Change the value, ask again: the same stored query, a different answer.
          </Next>
          <Next n={3} to="scope/scope-orders" title="Rows you may see">
            Switch accounts and watch the rows change — the filter is added on the server, after the query was written.
          </Next>
          <Next n={4} to="mutations/mutation-denied" title="Writes that do not exist">
            Writes are stored entries too, never generated. A verb the policy does not grant is refused at the wire.
          </Next>
        </Grid>
      </div>
    </Page>
  );
};
