import { useEffect, useMemo, useRef, useState, type FC, type ReactNode } from 'react';
import { createShell, type ActionDefinition, type LayoutNode } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/adapters/react';
import { PhoneFrame, PhoneStyles } from '@showroom/chrome/stage/phone';
import { Btn, Callout, Chip, Grid, INK, JsonDiff, Lead, Mono, Page, Panel } from '@showroom/chrome/stage/ui';
import { acmeRegistry, builtinRegistry } from './acme-kit';

// ═══════════════════════════════════════════════════════════
// What nova is for — the landing page.
//
// One screen of Acme Studio's app — this week's classes — written once as JSON
// and drawn twice: by nova's React builtins and by a small Acme kit written on
// this page (./acme-kit.tsx). Both phones render ONE real shell, so a booking
// on either shows on both. The chips edit the JSON; the diff shows exactly what
// changed. Everything here is the real nova renderer — nothing is simulated.
// ═══════════════════════════════════════════════════════════

const href = (path: string): string => `${import.meta.env.BASE_URL}nova/${path}`;

const CLASSES = [
  { id: 'morning', name: 'Morning flow', time: 'Mon 07:30', teacher: 'Theo' },
  { id: 'power', name: 'Power hour', time: 'Mon 12:15', teacher: 'Olivia' },
  { id: 'evening', name: 'Evening stretch', time: 'Tue 19:00', teacher: 'Theo' },
  { id: 'core', name: 'Core & breath', time: 'Wed 18:00', teacher: 'Olivia' },
  { id: 'weekend', name: 'Weekend long flow', time: 'Sat 10:00', teacher: 'Theo' },
];

// ── the layout, as a function of the chips ──────────────────────
// Each chip is one edit to the JSON. `AUTHORED` is where the page starts.

type Edits = { title: 'week' | 'book'; teacher: boolean; cards: boolean; book: boolean; typo: boolean };
const AUTHORED: Edits = { title: 'week', teacher: true, cards: true, book: true, typo: false };

const layoutOf = (e: Edits): LayoutNode => {
  const row: LayoutNode = {
    component: 'Stack',
    props: { direction: 'column', gap: 2 },
    children: [
      { component: e.typo ? 'Txet' : 'Text', props: { weight: 'bold' }, children: '{{$c.name}}' },
      { component: 'Text', props: { size: 'sm' }, children: e.teacher ? '{{$c.time}} · with {{$c.teacher}}' : '{{$c.time}}' },
    ],
  };
  return {
    component: 'Stack',
    props: { direction: 'column', gap: 12 },
    children: [
      { component: 'Text', props: { size: 'xl', weight: 'bold' }, children: e.title === 'week' ? 'This week' : 'Book a class' },
      { component: 'Text', props: { size: 'sm' }, children: 'Acme Studio · Vienna' },
      {
        component: 'Stack',
        props: { direction: 'column', gap: e.cards ? 8 : 0 },
        children: [
          {
            for: '$.classes',
            as: 'c',
            key: 'id',
            do: e.cards ? { component: 'Box', props: { padding: 12, radius: 10, border: true }, children: row } : { component: 'Box', props: { padding: 8 }, children: row },
          },
        ],
      },
      ...(e.book
        ? [
            { component: 'Text', props: { size: 'sm' }, children: 'You’ve booked {{$.booked}} this week.' },
            { component: 'Button', ref: 'book', props: { variant: 'primary' }, children: 'Book Morning flow' },
          ]
        : []),
    ],
  };
};

// ── one shell, rebuilt when the JSON changes ────────────────────
// The booking count is carried across a rebuild, so editing the layout never
// loses what the reader did in the app.

const shellFor = (layout: LayoutNode, booked: number) => {
  const timetable: ActionDefinition = {
    id: 'timetable',
    data: { classes: CLASSES, booked },
    layout,
    triggers: [{ event: 'ui:click', ref: 'book', do: [{ increment: 'booked' }] }],
  };
  return createShell({ canvases: [{ id: 'main', initial: 'timetable' }], actions: { timetable }, registry: builtinRegistry() });
};

const bookedIn = (data: Record<string, unknown> | undefined): number => {
  const v = data?.['booked'];
  return typeof v === 'number' ? v : 0;
};

// ── the parts ───────────────────────────────────────────────────

const Toggle: FC<{ on: boolean; onClick: () => void; children: ReactNode; tone?: 'accent' | 'bad' }> = ({ on, onClick, children, tone = 'accent' }) => (
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
      border: `1px solid ${on ? (tone === 'bad' ? '#fecaca' : '#c7d2fe') : INK.line}`,
      background: on ? (tone === 'bad' ? INK.badWash : INK.accentWash) : '#ffffff',
      color: on ? (tone === 'bad' ? INK.bad : INK.accent) : INK.soft,
    }}
  >
    {on ? '✓ ' : '+ '}
    {children}
  </button>
);

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

// ── the page ────────────────────────────────────────────────────

export const Intro: FC = () => {
  const [edits, setEdits] = useState<Edits>(AUTHORED);
  const [booked, setBooked] = useState(0);
  const bookedRef = useRef(0);
  const layout = useMemo(() => layoutOf(edits), [edits]);
  const authored = useMemo(() => layoutOf(AUTHORED), []);
  // A new layout is a new shell; the count rides along from the ref.
  const shell = useMemo(() => shellFor(layout, bookedRef.current), [layout]);
  const acme = useMemo(() => acmeRegistry(), []);

  // Follow the shell's data so the count survives a rebuild and shows beside.
  useEffect(() => {
    const read = (): void => {
      const n = bookedIn(shell.getState().canvases['main']?.active?.data);
      bookedRef.current = n;
      setBooked(n);
    };
    read();
    // A trigger that changes data fires onDataChange, not onStateChange.
    return shell.onDataChange(read);
  }, [shell]);

  const flip = (key: 'teacher' | 'cards' | 'book' | 'typo'): void => setEdits((e) => ({ ...e, [key]: !e[key] }));
  const changed = JSON.stringify(edits) !== JSON.stringify(AUTHORED);

  return (
    <Page>
      <PhoneStyles />
      <Lead eyebrow="nova" title="A screen is written down as data. How it looks is a kit you plug in.">
        Every screen in a nisc app is a <b>layout</b>: plain JSON naming components, their settings, and where their words come from (
        <Mono>{'{{$c.name}}'}</Mono> means “this class’s name”). Nova turns that JSON into a screen using whatever components you registered under
        those names — the <b>kit</b>. Swap the kit and the same screen looks like another app. Change the JSON and every kit follows. There is no
        screen code to keep in step.
      </Lead>

      <Panel
        title="One layout, two kits"
        aside={
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <Chip tone="accent">real nova</Chip> the Acme kit is written on this page
          </span>
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, color: INK.soft, marginRight: 2 }}>Edit the JSON:</span>
          <Toggle on={edits.title === 'book'} onClick={() => setEdits((e) => ({ ...e, title: e.title === 'week' ? 'book' : 'week' }))}>
            call it “Book a class”
          </Toggle>
          <Toggle on={edits.teacher} onClick={() => flip('teacher')}>
            say who teaches
          </Toggle>
          <Toggle on={edits.cards} onClick={() => flip('cards')}>
            cards, not rows
          </Toggle>
          <Toggle on={edits.book} onClick={() => flip('book')}>
            a Book button
          </Toggle>
          <Toggle on={edits.typo} onClick={() => flip('typo')} tone="bad">
            misspell Text as Txet
          </Toggle>
          <span style={{ flex: 1 }} />
          <Btn kind="quiet" disabled={!changed} title={changed ? 'Back to the authored layout' : 'Nothing edited yet'} onClick={() => setEdits(AUTHORED)}>
            Reset
          </Btn>
        </div>

        <Grid min={290} gap={20}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 650 }}>
              Nova’s builtins <span style={{ color: INK.faint, fontWeight: 500 }}>· the headless default</span>
            </div>
            <PhoneFrame tone="plain" width={300} status="Acme Studio" minHeight={440}>
              <Nova.Shell key={JSON.stringify(edits)} shell={shell} />
            </PhoneFrame>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 650 }}>
              The Acme kit <span style={{ color: INK.faint, fontWeight: 500 }}>· Text, Box, Button redrawn</span>
            </div>
            <PhoneFrame tone="accent" width={300} status="Acme Studio" minHeight={440}>
              <Nova.Shell key={JSON.stringify(edits)} shell={shell} registry={acme} />
            </PhoneFrame>
          </div>
        </Grid>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5, color: INK.soft }}>
          <Chip tone={booked > 0 ? 'ok' : 'idle'}>booked: {booked}</Chip>
          Both phones are one shell. Book on either and both update — the button in each kit sends the same event, and the action cannot tell which
          kit drew it.
        </div>
      </Panel>

      <Panel title="The JSON both phones are drawing" aside={changed ? 'red: as authored · green: after your edits' : 'as authored — edit it above'}>
        <JsonDiff before={authored} after={layout} beforeTitle="As authored" afterTitle="Now" maxHeight={420} />
      </Panel>

      <Grid min={280} gap={12}>
        <Callout tone="accent" title="The look is a stylesheet, not a rewrite">
          The Acme kit is three small components under names the builtins already use. No layout changed to adopt it. A different brand, a dark
          mode or a terminal renderer is another kit over the same JSON.
        </Callout>
        <Callout tone="accent" title="A mistake is a marker, not a blank screen">
          Misspell a component and nova draws a marker where it would have been; the rest of the screen still renders. Because the screen is data,
          it can be checked before anybody opens it.
        </Callout>
        <Callout tone="accent" title="Anything that can write JSON can build a screen">
          A server, an editor, a model: none of them needs to write React. That is why moss can stream screens to a thin client, and why an agent
          can author one.
        </Callout>
      </Grid>

      <Panel title="Five words">
        <div>
          <Word word="Layout">A tree of JSON nodes — a component name, its props, its children — with bindings like <Mono>$.classes</Mono> into data. It draws; it never decides.</Word>
          <Word word="Action">A layout plus its data and its triggers: “when <Mono>book</Mono> is clicked, add one to <Mono>booked</Mono>”. Every screen is one.</Word>
          <Word word="Canvas">A place that holds actions. A stack canvas shows the top one and Back is real; a list canvas shows them all, side by side.</Word>
          <Word word="Shell">The running app: its canvases, the actions they hold, and the messages between them. One per person under moss.</Word>
          <Word word="Kit">The components registered under the names layouts use. The only code that knows what a screen looks like.</Word>
        </div>
      </Panel>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Walk through it</div>
        <Grid min={300} gap={12}>
          <Next n={1} to="action/counter" title="An action, the smallest one">
            A number and two buttons. Open the Data tab and watch the triggers change the data the layout reads.
          </Next>
          <Next n={2} to="shell/push-pop-navigation" title="Screens on a stack">
            Push a screen, pop it. Back is the canvas’s stack, not a router.
          </Next>
          <Next n={3} to="action/compose-modal" title="A dialog that is only data">
            The whole modal — backdrop, header, buttons — is a fragment composed onto an ordinary form.
          </Next>
          <Next n={4} to="shell/list-mode-kanban" title="A board that composes itself">
            A list canvas: every card is an action rendering itself, laid out by one prop.
          </Next>
        </Grid>
      </div>
    </Page>
  );
};
