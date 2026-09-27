import { createContext, useContext, useEffect, useMemo, useState, type FC, type ReactNode } from 'react';
import type { LayoutNode } from '@niscorp/nova';
import { Nova, type NovaComponent } from '@niscorp/nova/adapters/react';
import type { Charter } from '@niscorp/charter';
import { PhoneFrame, type PhoneTone } from '@showroom/chrome/stage/phone';
import { getStudio, grantedActions, landingOf, SCREEN_READ, SCREENS, type Answer, type Person } from './studio';

// ═══════════════════════════════════════════════════════════
// The studio app, as one person sees it — a phone.
//
// Every screen is a nova layout (JSON) rendered by a small kit. The home screen
// is not authored per role: it lists the screens this person's charter
// resolves to, so a screen they are not granted is not greyed out — it is not
// there. The data on every screen is their own answer from vex.
// ═══════════════════════════════════════════════════════════

const Open = createContext<(id: string) => void>(() => undefined);

type Tile = { id: string; title: string; icon: string };
const isTiles = (v: unknown): v is Tile[] => Array.isArray(v);
const isRows = (v: unknown): v is Record<string, unknown>[] => Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

const Stack: NovaComponent = ({ children }: { children?: ReactNode }) => <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>;

const Title: NovaComponent = ({ children }: { children?: ReactNode }) => (
  <div style={{ fontSize: 19, fontWeight: 750, letterSpacing: -0.3, color: '#111827' }}>{children}</div>
);

const Note: NovaComponent = ({ children }: { children?: ReactNode }) => <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.45 }}>{children}</div>;

const Tiles: NovaComponent = ({ tiles }: { tiles?: unknown }) => {
  const open = useContext(Open);
  const list = isTiles(tiles) ? tiles : [];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
      {list.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => open(t.id)}
          style={{
            font: 'inherit',
            textAlign: 'left',
            padding: '12px 12px',
            borderRadius: 12,
            border: '1px solid #eef0f3',
            background: '#ffffff',
            boxShadow: '0 1px 2px rgba(17,24,39,0.05)',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <span style={{ fontSize: 18 }}>{t.icon}</span>
          <span style={{ fontSize: 12.5, fontWeight: 650, color: '#111827' }}>{t.title}</span>
        </button>
      ))}
    </div>
  );
};

const List: NovaComponent = ({ rows, primary, secondary, empty }: { rows?: unknown; primary?: unknown; secondary?: unknown; empty?: unknown }) => {
  const list = isRows(rows) ? rows : [];
  const sub = Array.isArray(secondary) ? secondary.filter((s): s is string => typeof s === 'string') : [];
  if (list.length === 0) return <Note>{text(empty)}</Note>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 12, border: '1px solid #eef0f3', overflow: 'hidden' }}>
      {list.map((r, i) => (
        <div key={i} style={{ padding: '9px 12px', borderTop: i === 0 ? 'none' : '1px solid #f1f2f4' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{text(r[text(primary)])}</div>
          {sub.length > 0 && <div style={{ fontSize: 11.5, color: '#6b7280' }}>{sub.map((k) => text(r[k])).filter((s) => s !== '').join(' · ')}</div>}
        </div>
      ))}
    </div>
  );
};

const Stat: NovaComponent = ({ value, label }: { value?: unknown; label?: unknown }) => (
  <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #eef0f3', padding: '18px 16px' }}>
    <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.8, color: '#111827' }}>{text(value)}</div>
    <div style={{ fontSize: 12, color: '#6b7280' }}>{text(label)}</div>
  </div>
);

const Pill: NovaComponent = ({ children }: { children?: ReactNode }) => (
  <div style={{ alignSelf: 'flex-start', padding: '8px 16px', borderRadius: 999, background: '#4f46e5', color: '#fff', fontSize: 12.5, fontWeight: 650 }}>{children}</div>
);

const KIT: Record<string, NovaComponent> = { Stack, Title, Note, Tiles, List, Stat, Pill };

// ── the screens, as layouts ─────────────────────────────────────

export const LAYOUTS: Readonly<Record<string, LayoutNode>> = {
  welcome: {
    component: 'Stack',
    children: [
      { component: 'Title', children: 'Acme Studio' },
      { component: 'Note', children: 'Yoga and movement in the old tram depot. Have a look around.' },
      { component: 'Tiles', props: { tiles: '$.tiles' } },
      { component: 'Pill', children: 'Sign in' },
    ],
  },
  home: {
    component: 'Stack',
    children: [
      { component: 'Title', children: 'Hi, {{$.name}}' },
      { component: 'Tiles', props: { tiles: '$.tiles' } },
    ],
  },
  timetable: {
    component: 'Stack',
    children: [
      { component: 'Title', children: 'This week' },
      { component: 'List', props: { rows: '$.rows', primary: 'name', secondary: ['time', 'instructor'], empty: 'No classes.' } },
    ],
  },
  'me.bookings': {
    component: 'Stack',
    children: [
      { component: 'Title', children: 'What you’ve booked' },
      { component: 'List', props: { rows: '$.rows', primary: 'name', secondary: ['time'], empty: 'Nothing booked yet.' } },
    ],
  },
  'me.bill': {
    component: 'Stack',
    children: [
      { component: 'Title', children: 'Your plan' },
      { component: 'Stat', props: { value: '$.stat.monthly', label: 'a month' } },
    ],
  },
  roster: {
    component: 'Stack',
    children: [
      { component: 'Title', children: 'Who’s coming' },
      { component: 'List', props: { rows: '$.rows', primary: 'name', secondary: ['class', 'time'], empty: 'Nobody booked.' } },
    ],
  },
  members: {
    component: 'Stack',
    children: [
      { component: 'Title', children: 'Members' },
      { component: 'List', props: { rows: '$.rows', primary: 'name', secondary: ['plan'], empty: 'No members.' } },
    ],
  },
  revenue: {
    component: 'Stack',
    children: [
      { component: 'Title', children: 'Revenue' },
      { component: 'Stat', props: { value: '$.stat.monthly', label: 'a month in memberships' } },
    ],
  },
  settings: {
    component: 'Stack',
    children: [
      { component: 'Title', children: 'Settings' },
      { component: 'List', props: { rows: '$.rows', primary: 'name', secondary: ['value'] } },
    ],
  },
};

const SETTINGS_ROWS = [
  { name: 'Studio name', value: 'Acme Studio' },
  { name: 'Booking window', value: '14 days' },
  { name: 'Cancellation', value: 'Free until 12h before' },
];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// ── the phone ───────────────────────────────────────────────────

export const StudioPhone: FC<{ person: Person; charter: Charter; tone?: PhoneTone; width?: number; ringFor?: (granted: ReadonlySet<string>) => PhoneTone }> = ({
  person,
  charter,
  tone,
  width = 260,
  ringFor,
}) => {
  const granted = useMemo(() => grantedActions(charter, person.roles), [charter, person.roles]);
  const landing = landingOf(granted);
  const [at, setAt] = useState<string | undefined>(landing);
  const [answer, setAnswer] = useState<Answer>();

  // A new charter or new roles: back to wherever this person now lands.
  useEffect(() => setAt(landing), [landing, granted]);

  const screen = at !== undefined && granted.has(at) ? at : landing;
  const read = screen === undefined ? undefined : SCREEN_READ[screen];

  useEffect(() => {
    let live = true;
    setAnswer(undefined);
    if (read === undefined) return;
    void getStudio()
      .then((s) => s.ask(charter, person, read))
      .then((a) => live && setAnswer(a));
    return () => {
      live = false;
    };
  }, [charter, person, read]);

  const tiles = SCREENS.filter((s) => granted.has(s.id) && s.id !== 'home' && s.id !== 'welcome').map(({ id, title, icon }) => ({ id, title, icon }));
  const body = isRecord(answer?.body) ? answer?.body : undefined;
  const result = body?.['result'];
  const data: Record<string, unknown> = {
    name: person.name,
    tiles,
    rows: screen === 'settings' ? SETTINGS_ROWS : Array.isArray(result) ? result : [],
    stat: isRecord(result) ? result : {},
  };
  const layout = screen === undefined ? undefined : LAYOUTS[screen];
  const refused = answer !== undefined && answer.status >= 400;

  return (
    <PhoneFrame tone={tone ?? ringFor?.(granted) ?? 'plain'} width={width} status={person.userId === undefined ? 'not signed in' : `signed in · ${person.name}`} minHeight={360}>
      <Open.Provider value={setAt}>
        {screen === undefined ? (
          <div style={{ fontSize: 13, color: '#6b7280', paddingTop: 40, textAlign: 'center' }}>No screen to land on — this person holds neither home nor welcome.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {screen !== landing && (
              <button
                type="button"
                onClick={() => setAt(landing)}
                style={{ font: 'inherit', alignSelf: 'flex-start', border: 'none', background: 'transparent', color: '#4f46e5', fontSize: 12.5, fontWeight: 650, padding: 0, cursor: 'pointer' }}
              >
                ‹ Back
              </button>
            )}
            {refused ? (
              <div style={{ fontSize: 12, color: '#b91c1c', background: '#fef2f2', border: '1px dashed #fca5a5', borderRadius: 10, padding: 10 }}>
                Refused: {isRecord(answer?.body) ? text(answer?.body['message']) : ''}
              </div>
            ) : layout !== undefined && (read === undefined || answer !== undefined) ? (
              <Nova.Layout key={screen} layout={layout} data={data} builtins={false} components={KIT} />
            ) : (
              <div style={{ fontSize: 12, color: '#9ca3af' }}>…</div>
            )}
          </div>
        )}
      </Open.Provider>
    </PhoneFrame>
  );
};

export const screenTitle = (id: string): string => SCREENS.find((s) => s.id === id)?.title ?? id;
