import { useMemo, useState, type FC, type ReactNode } from 'react';
import { z } from 'zod';
import { parse, toNova } from '@niscorp/loom';
import { LoomEditor } from '@niscorp/loom/react';
import { PhoneFrame } from '@showroom/chrome/stage/phone';
import { Btn, Callout, Chip, Code, Grid, INK, Lead, Mono, Page, Panel } from '@showroom/chrome/stage/ui';

// ═══════════════════════════════════════════════════════════
// What loom is for — the landing page.
//
// Olivia runs Acme Studio and edits a class: name, day, time, who teaches,
// how many spots. The form on the left is not written anywhere — loom compiled
// it from the Zod schema printed beside it. The phone is what members see,
// redrawn from the document on every keystroke. Add a field to the schema and
// the form grows one; break a rule and the same schema says so.
//
// Real: loom's compiler and editor, Zod's validation. The phone is a plain
// preview drawn on this page from the document loom writes.
// ═══════════════════════════════════════════════════════════

const href = (path: string): string => `${import.meta.env.BASE_URL}loom/${path}`;

// ── the schema, as a function of which extra fields are switched on ─

type Extras = { level: boolean; bring: boolean };

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const schemaOf = (x: Extras) =>
  z
    .object({
      name: z.string().min(3, { message: 'At least 3 characters' }).meta({ title: 'Class name' }),
      day: z.enum(DAYS).meta({ title: 'Day' }),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'A time like 07:30' }).meta({ title: 'Starts at' }),
      instructor: z.enum(['Theo', 'Olivia']).meta({ title: 'Taught by' }),
      spots: z.int().min(1, { message: 'At least one spot' }).max(30, { message: 'The room holds 30' }).meta({ title: 'Spots' }),
      ...(x.level ? { level: z.enum(['All levels', 'Gentle', 'Strong']).meta({ title: 'Level' }) } : {}),
      ...(x.bring ? { bring: z.string().meta({ title: 'What to bring' }) } : {}),
      bookable: z.boolean().meta({ title: 'Open for booking' }),
    })
    .meta({ title: 'Class' });

// The same schema as the reader would write it — printed, not evaluated.
const schemaText = (x: Extras): string =>
  [
    'z.object({',
    "  name: z.string().min(3, { message: 'At least 3 characters' }).meta({ title: 'Class name' }),",
    "  day: z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']).meta({ title: 'Day' }),",
    "  time: z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/, { message: 'A time like 07:30' }).meta({ title: 'Starts at' }),",
    "  instructor: z.enum(['Theo', 'Olivia']).meta({ title: 'Taught by' }),",
    "  spots: z.int().min(1, { message: 'At least one spot' }).max(30, { message: 'The room holds 30' }).meta({ title: 'Spots' }),",
    ...(x.level ? ["  level: z.enum(['All levels', 'Gentle', 'Strong']).meta({ title: 'Level' }),"] : []),
    ...(x.bring ? ["  bring: z.string().meta({ title: 'What to bring' }),"] : []),
    "  bookable: z.boolean().meta({ title: 'Open for booking' }),",
    '})',
  ].join('\n');

const START: Record<string, unknown> = { name: 'Evening stretch', day: 'Tue', time: '19:00', instructor: 'Theo', spots: 14, bookable: true };
const EXTRA_DEFAULTS: Record<keyof Extras, unknown> = { level: 'All levels', bring: 'A mat and water' };

// ── reading the document ────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (doc: Record<string, unknown>, key: string): string => {
  const v = doc[key];
  return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
};

// How many layout nodes loom compiled — the size of the form nobody wrote.
const countNodes = (v: unknown): number => {
  if (Array.isArray(v)) return v.reduce<number>((n, x) => n + countNodes(x), 0);
  if (!isRecord(v)) return 0;
  return (typeof v['component'] === 'string' ? 1 : 0) + Object.values(v).reduce<number>((n, x) => n + countNodes(x), 0);
};

// ── the member's phone ──────────────────────────────────────────

const MemberPhone: FC<{ doc: Record<string, unknown>; ok: boolean }> = ({ doc, ok }) => {
  const bookable = doc['bookable'] === true;
  const level = str(doc, 'level');
  const bring = str(doc, 'bring');
  return (
    <PhoneFrame tone={ok ? 'ok' : 'bad'} width={280} status="Acme Studio" minHeight={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 19, fontWeight: 750, letterSpacing: -0.3 }}>This week</div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>What members see, drawn from the document as you type.</div>
        <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${ok ? '#eef0f3' : '#fecaca'}`, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{str(doc, 'name') || '—'}</div>
            <div style={{ fontSize: 12, fontWeight: 650, color: INK.accent, whiteSpace: 'nowrap' }}>
              {str(doc, 'day')} {str(doc, 'time')}
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: '#4b5563' }}>with {str(doc, 'instructor') || '—'}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Chip>{str(doc, 'spots') || '0'} spots</Chip>
            {level !== '' && <Chip tone="accent">{level}</Chip>}
          </div>
          {bring !== '' && <div style={{ fontSize: 12, color: '#6b7280' }}>Bring: {bring}</div>}
          <div
            style={{
              marginTop: 4,
              textAlign: 'center',
              padding: '9px 12px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 650,
              background: bookable ? INK.accent : '#f3f4f6',
              color: bookable ? '#fff' : '#9ca3af',
            }}
          >
            {bookable ? 'Book a spot' : 'Not open for booking yet'}
          </div>
        </div>
        {!ok && <div style={{ fontSize: 11.5, color: INK.bad, textAlign: 'center' }}>Olivia can’t save this yet — the members still see the last good version.</div>}
      </div>
    </PhoneFrame>
  );
};

const Toggle: FC<{ on: boolean; onClick: () => void; children: ReactNode }> = ({ on, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      font: 'inherit',
      fontSize: 12.5,
      fontWeight: 650,
      padding: '4px 11px',
      borderRadius: 999,
      cursor: 'pointer',
      border: `1px solid ${on ? '#c7d2fe' : INK.line}`,
      background: on ? INK.accentWash : '#ffffff',
      color: on ? INK.accent : INK.soft,
    }}
  >
    {on ? '✓ ' : '+ '}
    {children}
  </button>
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

// ── the page ────────────────────────────────────────────────────

export const Intro: FC = () => {
  const [extras, setExtras] = useState<Extras>({ level: false, bring: false });
  const [doc, setDoc] = useState<Record<string, unknown>>(START);
  // Bumped on every schema change or reset: loom reads its artifact once on
  // mount, so a new schema is a new editor, opened on the document so far.
  const [generation, setGeneration] = useState(0);

  const schema = useMemo(() => schemaOf(extras), [extras]);
  const compiled = useMemo(() => countNodes(toNova(parse(schema)).action.layout), [schema]);
  const check = schema.safeParse(doc);
  const problems = check.success ? [] : check.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);

  const flip = (key: keyof Extras): void => {
    const on = !extras[key];
    setExtras({ ...extras, [key]: on });
    setDoc((d) => {
      const next = { ...d };
      if (on) next[key] = EXTRA_DEFAULTS[key];
      else delete next[key];
      return next;
    });
    setGeneration((g) => g + 1);
  };

  const reset = (): void => {
    setExtras({ level: false, bring: false });
    setDoc(START);
    setGeneration((g) => g + 1);
  };
  const edited = extras.level || extras.bring || JSON.stringify(doc) !== JSON.stringify(START);

  return (
    <Page>
      <Lead eyebrow="loom" title="Describe the data once. The form to edit it is compiled, not written.">
        Every app has forms, and every form repeats what the data’s description already says: this is text, this is a number between 1 and 30,
        this is one of three choices. Loom reads that description — a Zod schema — and compiles the form from it: the fields, the widgets, the
        lists you can add to, and the checks, which are the schema’s own. Change the schema and the form changes with it.
      </Lead>

      <Panel
        title="Olivia edits a class"
        aside={
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <Chip tone="accent">real loom</Chip> the phone is a preview drawn on this page
          </span>
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, color: INK.soft, marginRight: 2 }}>Add to the schema:</span>
          <Toggle on={extras.level} onClick={() => flip('level')}>
            a level (one of three)
          </Toggle>
          <Toggle on={extras.bring} onClick={() => flip('bring')}>
            what to bring (text)
          </Toggle>
          <span style={{ flex: 1 }} />
          <Btn kind="quiet" onClick={reset} disabled={!edited} title={edited ? 'Back to the stored class' : 'Nothing changed yet'}>
            Reset
          </Btn>
        </div>

        <Grid min={300} gap={20}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 650 }}>The form</span>
              <Chip>{compiled} layout nodes, compiled</Chip>
              <Chip tone={check.success ? 'ok' : 'bad'}>{check.success ? 'valid — would save' : `${problems.length} to fix`}</Chip>
            </div>
            <div style={{ border: `1px solid ${INK.line}`, borderRadius: 12, padding: 14, background: '#fff' }}>
              <LoomEditor
                key={generation}
                plugins={[{ name: 'class', documents: { value: schema } }]}
                artifact={{ type: 'class', documents: { value: doc } }}
                onChange={(docs) => {
                  const v = docs['value'];
                  if (isRecord(v)) setDoc(v);
                }}
              />
            </div>
            <div style={{ fontSize: 12, color: INK.soft }}>Try: empty the name, set 31 spots, or type “7pm” as the time.</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <MemberPhone doc={doc} ok={check.success} />
          </div>
        </Grid>
      </Panel>

      <Grid min={320}>
        <Panel title="The schema" aside="all anybody wrote">
          <Code maxHeight={320}>{schemaText(extras)}</Code>
        </Panel>
        <Panel title="The document the form writes" aside={check.success ? 'passes the schema' : 'fails the schema'}>
          <Code maxHeight={320}>{JSON.stringify(doc, null, 2)}</Code>
          {problems.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {problems.map((p) => (
                <div key={p} style={{ fontSize: 12.5, color: INK.bad }}>
                  ✗ {p}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </Grid>

      <Grid min={280} gap={12}>
        <Callout tone="accent" title="One description, three jobs">
          The schema types the code, checks what is saved, and now draws the form. Nothing to keep in step: add a field and all three know.
        </Callout>
        <Callout tone="accent" title="The checks are the real ones">
          “The room holds 30” is the message on <Mono>.max(30)</Mono>. Loom runs Zod itself as you type, so the form can’t disagree with what the
          server will accept.
        </Callout>
        <Callout tone="accent" title="The form is a nova screen">
          What loom compiles is an ordinary nova action — JSON. So its widgets are a kit you can swap, and any other schema, a query or a transform,
          gets an editor the same way.
        </Callout>
      </Grid>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Walk through it</div>
        <Grid min={300} gap={12}>
          <Next n={1} to="basics/validation" title="Checks as you type">
            Break a rule and the message appears under the field; fix it and it clears.
          </Next>
          <Next n={2} to="structure/union" title="Choose a kind, get its fields">
            A discriminated union: pick one option and only its fields show.
          </Next>
          <Next n={3} to="resolver/two-kits" title="One form, two looks">
            The same compiled form through two widget kits.
          </Next>
          <Next n={4} to="plugins/vex-query" title="Editing a database query">
            Loom on vex’s own query schema, against a Postgres running in this tab.
          </Next>
        </Grid>
      </div>
    </Page>
  );
};
