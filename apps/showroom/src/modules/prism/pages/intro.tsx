import { useMemo, useState, type FC, type ReactNode } from 'react';
import { ConfigSchema, evaluateSafe } from '@niscorp/prism';
import { PhoneFrame, PhoneStyles } from '@showroom/chrome/stage/phone';
import { Btn, Callout, Chip, Grid, INK, Lead, Mono, Page, Panel } from '@showroom/chrome/stage/ui';
import { Block, json, opsOf } from '../parts';
import { bookedOf, configFor, responseFor, SESSIONS, type Happenings, type Language } from '../world/booking';

// ═══════════════════════════════════════════════════════════
// What prism is for — the landing page.
//
// Acme Studio's booking system answers with a vendor's JSON; the members'
// phone needs a short list in their own language. The page shows the gap
// drawn both ways — straight from the response, and through one Prism
// config — then the three pieces side by side: in, config, out.
//
// Real: @niscorp/prism parses and evaluates the config on every click.
// Simulated (and labelled): the booking system, and the things that happen at
// the studio — a booking, a cancellation — which only edit its response.
// ═══════════════════════════════════════════════════════════

const href = (path: string): string => `${import.meta.env.BASE_URL}prism/${path}`;

const MORNING = 'ses_4417';
const POWER = 'ses_4418';
const NOTHING: Happenings = { extraBookings: {}, cancelled: new Set() };

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

// ── the two phones ──────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : v === undefined ? '' : JSON.stringify(v));
const at = (v: unknown, ...path: string[]): unknown => path.reduce<unknown>((cur, k) => (isRecord(cur) ? cur[k] : undefined), v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const Row: FC<{ primary: string; secondary: string; badge?: ReactNode; first: boolean }> = ({ primary, secondary, badge, first }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderTop: first ? 'none' : '1px solid #f1f2f4' }}>
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: INK.text }}>{primary}</div>
      <div style={{ fontSize: 11.5, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{secondary}</div>
    </div>
    {badge}
  </div>
);

const Card: FC<{ children: ReactNode }> = ({ children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 12, border: '1px solid #eef0f3', overflow: 'hidden' }}>{children}</div>
);

// The same list, pointed straight at the vendor's response: it can only show
// the fields that are there, as they are there.
const RawPhone: FC<{ response: unknown }> = ({ response }) => {
  const sessions = list(at(response, 'data', 'sessions'));
  return (
    <PhoneFrame tone="bad" width={290} status="drawn from the response">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 750, letterSpacing: -0.3 }}>{text(at(response, 'data', 'location', 'id'))}</div>
        <Card>
          {sessions.map((s, i) => (
            <Row
              key={i}
              first={i === 0}
              primary={text(at(s, 'attributes', 'title'))}
              secondary={`${text(at(s, 'attributes', 'start_at'))} · ${text(at(s, 'attributes', 'booked_count'))}/${text(at(s, 'attributes', 'capacity'))} · ${text(at(s, 'attributes', 'price_cents'))}`}
            />
          ))}
        </Card>
      </div>
    </PhoneFrame>
  );
};

const BADGE: Record<string, { fg: string; bg: string }> = {
  full: { fg: INK.bad, bg: INK.badWash },
  few: { fg: INK.warn, bg: INK.warnWash },
  open: { fg: INK.ok, bg: INK.okWash },
};

const ShapedPhone: FC<{ output: unknown }> = ({ output }) => {
  const classes = list(at(output, 'classes'));
  return (
    <PhoneFrame tone="ok" width={290} status="drawn from Prism’s output">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 750, letterSpacing: -0.3 }}>{text(at(output, 'heading'))}</div>
        <Card>
          {classes.map((c, i) => {
            const tone = BADGE[text(at(c, 'status'))] ?? BADGE.open;
            return (
              <Row
                key={i}
                first={i === 0}
                primary={text(at(c, 'name'))}
                secondary={`${text(at(c, 'when'))} · ${text(at(c, 'teacher'))} · ${text(at(c, 'price'))}`}
                badge={
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999, color: tone?.fg, background: tone?.bg, whiteSpace: 'nowrap' }}>
                    {text(at(c, 'spots'))}
                  </span>
                }
              />
            );
          })}
        </Card>
      </div>
    </PhoneFrame>
  );
};

// ── the page ────────────────────────────────────────────────────

export const Intro: FC = () => {
  const [language, setLanguage] = useState<Language>('en');
  const [happened, setHappened] = useState<Happenings>(NOTHING);

  const response = useMemo(() => responseFor(happened), [happened]);
  const config = useMemo(() => configFor(language), [language]);
  const result = useMemo(() => {
    const parsed = ConfigSchema.safeParse(config);
    if (!parsed.success) return { ok: false, error: parsed.error.message } as const;
    const out = evaluateSafe(parsed.data, response);
    return out.ok ? ({ ok: true, output: out.data } as const) : ({ ok: false, error: out.error.message } as const);
  }, [config, response]);

  const morning = SESSIONS.find((s) => s.id === MORNING);
  const morningFull = morning !== undefined && bookedOf(morning, happened) >= morning.capacity;
  const powerCancelled = happened.cancelled.has(POWER);
  const changed = happened !== NOTHING;

  const book = (): void =>
    setHappened((h) => ({ ...h, extraBookings: { ...h.extraBookings, [MORNING]: (h.extraBookings[MORNING] ?? 0) + 1 } }));
  const toggleCancel = (): void =>
    setHappened((h) => {
      const cancelled = new Set(h.cancelled);
      if (cancelled.has(POWER)) cancelled.delete(POWER);
      else cancelled.add(POWER);
      return { ...h, cancelled };
    });

  return (
    <Page>
      <PhoneStyles />
      <Lead eyebrow="prism" title="The data an app gets is never the data a screen shows. Prism is the step in between — written as JSON, not code.">
        Acme Studio’s booking system answers in its own words: ids, timestamps, counts in cents. The members’ phone wants “Mon 07:30 · with Theo · 2
        spots left”. Something has to turn one into the other. With Prism that something is a <b>config</b> — a small JSON document that says how —
        so it can be stored, sent, checked and changed like any other data.
      </Lead>

      <Panel
        title="The problem, in one picture"
        aside={
          <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
            <Chip tone="warn">booking system simulated</Chip>
            <Chip tone="accent">Prism real</Chip>
          </span>
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, color: INK.soft }}>Phone language:</span>
          <Btn kind={language === 'en' ? 'primary' : 'plain'} onClick={() => setLanguage('en')}>
            English
          </Btn>
          <Btn kind={language === 'de' ? 'primary' : 'plain'} onClick={() => setLanguage('de')}>
            Deutsch (Wien)
          </Btn>
          <span style={{ width: 1, height: 22, background: INK.line, margin: '0 6px' }} />
          <span style={{ fontSize: 12.5, color: INK.soft }}>At the studio:</span>
          <Btn onClick={book} disabled={morningFull} title={morningFull ? 'Morning flow is full — nobody else can book it' : undefined}>
            Mia books Morning flow
          </Btn>
          <Btn onClick={toggleCancel}>{powerCancelled ? 'Olivia puts Power hour back' : 'Olivia cancels Power hour'}</Btn>
          <Btn kind="quiet" onClick={() => setHappened(NOTHING)} disabled={!changed} title={changed ? undefined : 'Nothing has happened yet'}>
            Reset
          </Btn>
        </div>

        <Grid min={300}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <RawPhone response={response} />
            <div style={{ fontSize: 13, color: INK.soft, textAlign: 'center', maxWidth: 300, lineHeight: 1.5 }}>
              <b style={{ color: INK.bad }}>Straight from the response.</b> Timestamps, cents, the vendor’s order, a cancelled class still listed. Every
              screen that fixes this in its own code fixes it differently.
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            {result.ok ? <ShapedPhone output={result.output} /> : <Callout tone="bad" title="The config was refused">{result.error}</Callout>}
            <div style={{ fontSize: 13, color: INK.soft, textAlign: 'center', maxWidth: 300, lineHeight: 1.5 }}>
              <b style={{ color: INK.ok }}>Through one Prism config.</b> In order, in the member’s language, spots counted, cancelled classes gone. The
              phone formats nothing — it draws what it is given.
            </div>
          </div>
        </Grid>
      </Panel>

      <Grid min={300} gap={14}>
        <Panel title="1 · What the booking system sends" aside={`${SESSIONS.length} classes`}>
          <Block maxHeight={420}>{json(response)}</Block>
        </Panel>
        <Panel title="2 · The Prism config" aside={`${opsOf(config).length} operators · JSON`}>
          <Block maxHeight={420}>{json(config)}</Block>
        </Panel>
        <Panel title="3 · What the phone gets" tone={result.ok ? 'ok' : 'bad'} aside={result.ok ? <Chip tone="ok">evaluated in this page</Chip> : <Chip tone="bad">refused</Chip>}>
          <Block tone={result.ok ? 'ok' : 'bad'} maxHeight={420}>
            {result.ok ? json(result.output) : result.error}
          </Block>
        </Panel>
      </Grid>

      <Panel title="Five words">
        <div>
          <Word word="Config">A JSON document that says how to turn one piece of data into another. It is data: it can be stored, sent and checked.</Word>
          <Word word="Source">
            The data a config reads, written <Mono>$</Mono>. <Mono>{'{ "$ref": "$.data.sessions" }'}</Mono> means “the sessions in what came in”.
          </Word>
          <Word word="Operator">
            A key that starts with <Mono>$</Mono> — <Mono>$map</Mono>, <Mono>$filter</Mono>, <Mono>$localeDate</Mono>. A closed list: a config can only
            do what the operators can, and cannot run code.
          </Word>
          <Word word="Variable">
            A name for “the item I’m on”: <Mono>{'"as": "s"'}</Mono> inside a <Mono>$map</Mono>, read back with <Mono>{'{ "$var": "s" }'}</Mono>.
          </Word>
          <Word word="Compile">
            Parse and check a config once, into a form that runs fast many times. Vex stores compiled configs beside its queries.
          </Word>
        </div>
      </Panel>

      <Grid min={280} gap={12}>
        <Callout tone="accent" title="Why JSON, not a function">
          A function can only live in the code it was deployed with. A config can live in a database row, arrive with a query, or be written by a model —
          and it is checked against a schema before it runs, so a bad one is refused, not executed.
        </Callout>
        <Callout tone="accent" title="Where you meet it in nisc">
          A request body built from a screen’s data, every query result vex shapes for a screen, every document migration strata runs: each is a Prism config.
          Formatting lives there, so no component ever formats a date.
        </Callout>
      </Grid>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Walk through it</div>
        <Grid min={320} gap={12}>
          <Next n={1} to="transform/api-to-ui" title="API → UI shape">
            A verbose API response with metadata and paging, shaped into the lean JSON a screen consumes.
          </Next>
          <Next n={2} to="transform/calculated-fields" title="Calculated fields">
            Subtotal, tax and total computed from line items — with a named intermediate so nothing is computed twice.
          </Next>
          <Next n={3} to="transform/group-by" title="Group by">
            Turn a flat list into buckets, the shape a sectioned list or a chart needs.
          </Next>
          <Next n={4} to="transform/search-sort-paginate" title="Search, sort, paginate">
            A whole list screen’s worth of logic — filter by a term, order, take one page — as one config.
          </Next>
        </Grid>
      </div>
    </Page>
  );
};
