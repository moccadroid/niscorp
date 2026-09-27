import { useMemo, useState, type FC } from 'react';
import { verifyCharter, type Charter } from '@niscorp/charter';
import { PhoneStyles } from '@showroom/chrome/stage/phone';
import { Btn, Callout, Chip, Code, Grid, INK, Lead, MONO, Mono, Page, Panel } from '@showroom/chrome/stage/ui';
import { StudioPhone } from '../world/screens';
import { ACTIONS, CHARTER, DATA, grantedActions, grantedData, PEOPLE, ROLES, SCREENS, TABLES } from '../world/studio';

// ═══════════════════════════════════════════════════════════
// Write the charter — by clicking.
//
// The studio's policy as a grid: which role gets which screen, which tables it
// may read, and how far it reaches. Every click rewrites the charter (shown
// live, as the JSON the app would ship), the verifier re-checks it, and the four
// phones re-resolve — the real resolver, the real verifier, the real vex reads
// behind every screen.
// ═══════════════════════════════════════════════════════════

type Role = (typeof ROLES)[number];
type Draft = Record<Role, { screens: string[]; tables: string[]; personal: boolean }>;

// The studio's own charter, spelled out id by id (the real one says it
// shorter, with globs and `extends` — see "Who sees what").
const fromCharter = (): Draft => {
  const draft: Partial<Draft> = {};
  for (const role of ROLES) {
    draft[role] = {
      screens: [...grantedActions(CHARTER, [role])],
      tables: [...grantedData(CHARTER, [role])].filter((g) => g.endsWith('.read')).map((g) => g.replace('.read', '')),
      personal: role === 'member',
    };
  }
  return { guest: draft.guest ?? empty(), member: draft.member ?? empty(), instructor: draft.instructor ?? empty(), owner: draft.owner ?? empty() };
};
const empty = () => ({ screens: [], tables: [], personal: false });

const PRESETS: readonly { label: string; make: () => Draft }[] = [
  { label: 'The studio’s charter', make: fromCharter },
  {
    label: 'Everyone gets everything',
    make: () => {
      const all = { screens: [...ACTIONS], tables: [...TABLES], personal: false };
      return { guest: { ...all }, member: { ...all }, instructor: { ...all }, owner: { ...all } };
    },
  },
  { label: 'Nobody gets anything', make: () => ({ guest: empty(), member: empty(), instructor: empty(), owner: empty() }) },
];

const toCharter = (draft: Draft): Charter =>
  Object.fromEntries(
    ROLES.map((role) => {
      const d = draft[role];
      return [role, { actions: [...d.screens], data: d.tables.map((t) => `${t}.read`), ...(d.personal ? { scoping: 'personal' } : {}) }];
    }),
  );

const toggle = (list: readonly string[], id: string): string[] => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

const Cell: FC<{ on: boolean; onClick: () => void; label: string }> = ({ on, onClick, label }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    style={{
      width: 30,
      height: 26,
      borderRadius: 7,
      cursor: 'pointer',
      border: `1px solid ${on ? '#a7f3d0' : INK.line}`,
      background: on ? '#d1fae5' : '#ffffff',
      color: on ? '#065f46' : INK.line,
      fontWeight: 800,
      fontSize: 13,
      font: 'inherit',
    }}
  >
    {on ? '✓' : ''}
  </button>
);

export const Build: FC = () => {
  const [draft, setDraft] = useState<Draft>(fromCharter);
  const charter = useMemo(() => toCharter(draft), [draft]);
  const report = useMemo(() => verifyCharter(charter, { actions: ACTIONS, data: DATA }, PEOPLE.map((p) => p.roles)), [charter]);

  const set = (role: Role, change: (d: Draft[Role]) => Draft[Role]): void => setDraft((d) => ({ ...d, [role]: change(d[role]) }));

  return (
    <Page>
      <PhoneStyles />
      <Lead eyebrow="Write the charter" title="Click the policy together — and watch four people’s apps follow it.">
        Each column is a role; each tick gives that role a screen or lets it read a table. “Own rows only” limits how far a role reads. Every click
        rewrites the charter below, the verifier checks it, and the four phones re-resolve — no code involved.
      </Lead>

      <Panel>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: INK.faint }}>Start from</span>
          {PRESETS.map((p) => (
            <Btn key={p.label} onClick={() => setDraft(p.make())}>
              {p.label}
            </Btn>
          ))}
          <span style={{ flex: 1 }} />
          <Chip tone={report.errors.length > 0 ? 'bad' : report.warnings.length > 0 ? 'warn' : 'ok'}>
            {report.errors.length > 0 ? `${report.errors.length} error — would not boot` : report.warnings.length > 0 ? `${report.warnings.length} warning` : 'verifies clean'}
          </Chip>
        </div>
      </Panel>

      <Grid min={360} gap={16}>
        <Panel title="Screens" aside="which role gets which screen">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th />
                  {ROLES.map((r) => (
                    <th key={r} style={{ padding: '4px 6px', fontWeight: 650 }}>
                      {r}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SCREENS.map((s) => {
                  const orphan = ROLES.every((r) => !draft[r].screens.includes(s.id));
                  return (
                    <tr key={s.id}>
                      <td style={{ padding: '3px 10px 3px 0', whiteSpace: 'nowrap', color: orphan ? INK.warn : INK.text }}>
                        {s.icon} {s.title}
                        {orphan ? ' · nobody' : ''}
                      </td>
                      {ROLES.map((r) => (
                        <td key={r} style={{ padding: 3, textAlign: 'center' }}>
                          <Cell on={draft[r].screens.includes(s.id)} label={`${r}: ${s.title}`} onClick={() => set(r, (d) => ({ ...d, screens: toggle(d.screens, s.id) }))} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Panel title="Data" aside="which tables each role may read — enforced by the database">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th />
                    {ROLES.map((r) => (
                      <th key={r} style={{ padding: '4px 6px', fontWeight: 650 }}>
                        {r}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TABLES.map((t) => (
                    <tr key={t}>
                      <td style={{ padding: '3px 10px 3px 0', fontFamily: MONO, fontSize: 12 }}>{t}</td>
                      {ROLES.map((r) => (
                        <td key={r} style={{ padding: 3, textAlign: 'center' }}>
                          <Cell on={draft[r].tables.includes(t)} label={`${r} reads ${t}`} onClick={() => set(r, (d) => ({ ...d, tables: toggle(d.tables, t) }))} />
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td style={{ padding: '8px 10px 3px 0', fontSize: 12, color: INK.soft }}>Own rows only</td>
                    {ROLES.map((r) => (
                      <td key={r} style={{ padding: '8px 3px 3px', textAlign: 'center' }}>
                        <Cell on={draft[r].personal} label={`${r} reads only their own rows`} onClick={() => set(r, (d) => ({ ...d, personal: !d.personal }))} />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="What the verifier says" tone={report.errors.length > 0 ? 'bad' : 'plain'}>
            {[...report.errors, ...report.warnings].length === 0 ? (
              <div style={{ fontSize: 13, color: INK.ok }}>Nothing to report — every screen is reachable, every rule selects something.</div>
            ) : (
              [...report.errors, ...report.warnings].map((issue, i) => (
                <div key={i} style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                  <span style={{ fontFamily: MONO, fontWeight: 700, color: issue.level === 'error' ? INK.bad : INK.warn }}>
                    {issue.level} · {issue.rule}
                  </span>{' '}
                  {issue.detail}
                </div>
              ))
            )}
          </Panel>
        </div>
      </Grid>

      <Grid min={240} gap={18}>
        {PEOPLE.map((p) => (
          <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 650 }}>
              {p.name} <span style={{ color: INK.faint, fontWeight: 500 }}>· {p.roles.join(' + ')}</span>
            </div>
            <StudioPhone person={p} charter={charter} tone="accent" width={240} />
          </div>
        ))}
      </Grid>

      <Grid min={320} gap={12}>
        <Panel title="The charter you just wrote" aside="the JSON the app ships">
          <Code maxHeight={320}>{JSON.stringify(charter, null, 2)}</Code>
        </Panel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Callout tone="accent" title="Try this">
            Untick Mia’s <i>My plan</i> screen: it leaves her phone. Give members <Mono>subscriptions</Mono> without “own rows only” and open Mia’s
            My plan — it now shows the whole studio’s revenue. The screen didn’t change; what the database will tell her did.
          </Callout>
          <Callout tone="accent" title="Two rings">
            The screens grid decides what exists in each app. The data grid decides what the database answers. A screen without the data behind it
            shows a refusal; data without the screen is unreachable from the app — and still enforced.
          </Callout>
        </div>
      </Grid>
    </Page>
  );
};
