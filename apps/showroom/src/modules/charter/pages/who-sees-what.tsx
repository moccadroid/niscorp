import { useEffect, useMemo, useState, type FC } from 'react';
import { PhoneFrame, PhoneStyles } from '@showroom/chrome/stage/phone';
import { Callout, Chip, Code, Grid, INK, Lead, MONO, Mono, Page, Panel } from '@showroom/chrome/stage/ui';
import { StudioPhone } from '../world/screens';
import { CHARTER, getStudio, grantedActions, PEOPLE, ROLES, SCREENS, type Answer, type Person } from '../world/studio';

// ═══════════════════════════════════════════════════════════
// Who sees what — the charter's whole job, shown as the thing it decides.
//
// Four people, one app. Each phone is the real app resolved for that person:
// the charter picks which screens exist for them, vex answers every screen from
// their own policy. Put a role on or take one off and watch the phone change.
// ═══════════════════════════════════════════════════════════

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// The usual way: every tile drawn for everyone, the ones you lack locked — and
// the endpoint behind a locked tile served without a policy.
const UsualWay: FC<{ person: Person }> = ({ person }) => {
  const granted = useMemo(() => grantedActions(CHARTER, person.roles), [person]);
  const [peek, setPeek] = useState<Answer>();
  useEffect(() => {
    void getStudio()
      .then((s) => s.ask(CHARTER, person, 'subscriptions/revenue', true))
      .then(setPeek);
  }, [person]);
  const result = isRecord(peek?.body) ? peek?.body['result'] : undefined;
  const leaked = isRecord(result) ? String(result['monthly'] ?? '') : '…';
  return (
    <PhoneFrame tone="bad" width={260} status={`signed in · ${person.name}`} minHeight={360}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 19, fontWeight: 750, letterSpacing: -0.3 }}>Hi, {person.name}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          {SCREENS.filter((s) => s.id !== 'home' && s.id !== 'welcome').map((s) => {
            const locked = !granted.has(s.id);
            return (
              <div
                key={s.id}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid #eef0f3',
                  background: locked ? '#f3f4f6' : '#fff',
                  opacity: locked ? 0.55 : 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 18 }}>{locked ? '🔒' : s.icon}</span>
                <span style={{ fontSize: 12.5, fontWeight: 650 }}>{s.title}</span>
              </div>
            );
          })}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10.5, lineHeight: 1.5, background: '#111827', color: '#e5e7eb', borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ color: '#9ca3af' }}>// devtools, one line</div>
          <div>fetch('/api/revenue')</div>
          <div style={{ color: '#fca5a5' }}>→ {`{ monthly: "${leaked}" }`}</div>
        </div>
      </div>
    </PhoneFrame>
  );
};

export const WhoSeesWhat: FC = () => {
  const [people, setPeople] = useState<readonly Person[]>(PEOPLE);
  const mia = PEOPLE.find((p) => p.id === 'mia') ?? PEOPLE[0];

  const toggle = (id: string, role: string) =>
    setPeople((ps) =>
      ps.map((p) => (p.id !== id ? p : { ...p, roles: p.roles.includes(role) ? p.roles.filter((r) => r !== role) : [...p.roles, role] })),
    );

  return (
    <Page>
      <PhoneStyles />
      <Lead eyebrow="Who sees what" title="One app, four people — and nobody is shown a door they can’t open.">
        Acme Studio has an owner, an instructor who also trains there, a member and a visitor. Each phone below is the real app, resolved for that
        person: the charter decides which screens exist for them, and every number and list on those screens is their own answer from the database.
        Tap around. Then put a role on somebody, or take one off.
      </Lead>

      <Grid min={250} gap={18}>
        {people.map((p) => (
          <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <div style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 15, fontWeight: 750 }}>{p.name}</div>
              <div style={{ fontSize: 12.5, color: INK.soft, minHeight: 34 }}>{p.blurb}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {ROLES.map((role) => {
                  const worn = p.roles.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggle(p.id, role)}
                      title={worn ? `Take ${role} away from ${p.name}` : `Make ${p.name} ${role === 'owner' ? 'an' : 'a'} ${role}`}
                      style={{
                        font: 'inherit',
                        fontSize: 11.5,
                        fontWeight: 650,
                        padding: '2px 9px',
                        borderRadius: 999,
                        cursor: 'pointer',
                        border: `1px solid ${worn ? '#c7d2fe' : INK.line}`,
                        background: worn ? INK.accentWash : '#fff',
                        color: worn ? INK.accent : INK.faint,
                      }}
                    >
                      {worn ? '✓ ' : '+ '}
                      {role}
                    </button>
                  );
                })}
              </div>
            </div>
            <StudioPhone person={p} charter={CHARTER} tone="accent" width={250} />
          </div>
        ))}
      </Grid>

      <Callout tone="accent" title="Look for what isn’t there">
        Mia has no Roster tile — not a greyed-out one, none. The visitor lands on Welcome and the others on Home, and nobody configured that: each
        phone boots the first of <Mono>home</Mono>, <Mono>welcome</Mono> the person actually holds. And Theo, who teaches <i>and</i> trains, holds
        both: the roster of his classes and his own bookings.
      </Callout>

      <Panel title="The usual way, for comparison" aside="every tile for everyone; a lock on the ones you lack">
        <Grid min={280} gap={18}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>{mia !== undefined && <UsualWay person={mia} />}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13.5, lineHeight: 1.6 }}>
            <div>
              Most apps draw every screen for everyone and put a lock on the ones you lack — an <Mono>if (user.role === 'owner')</Mono> in a
              component. The lock is paint. The endpoint behind it answers whoever asks: here, Mia’s browser asking for revenue gets the studio’s
              figure.
            </div>
            <div>
              With a charter there is no lock to draw, because the screen was never mounted — and the answer is decided in the database, not the
              button: the same question from Mia returns <b>her own €89</b>. See <i>Same question, different answers</i>.
            </div>
          </div>
        </Grid>
      </Panel>

      <Grid min={340}>
        <Panel title="The charter" aside="the whole policy — roles → what they select">
          <Code maxHeight={380}>{JSON.stringify(CHARTER, null, 2)}</Code>
          <div style={{ fontSize: 12.5, color: INK.soft, lineHeight: 1.55 }}>
            <Mono>actions</Mono> picks screens, <Mono>data</Mono> picks <Mono>table.verb</Mono> grants, <Mono>*</Mono> is a glob,{' '}
            <Mono>extends</Mono> composes whole roles and <Mono>deny</Mono> wins. <Mono>scoping: personal</Mono> says how far a member reaches:
            their own rows.
          </div>
        </Panel>
        <Panel title="What each person holds" aside="resolved from the charter, live">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12.5, width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: INK.faint, fontWeight: 600 }}>screen</th>
                  {people.map((p) => (
                    <th key={p.id} style={{ padding: '6px 8px', fontWeight: 650 }}>
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SCREENS.map((s) => (
                  <tr key={s.id} style={{ borderTop: `1px solid ${INK.line}` }}>
                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                      {s.icon} {s.title} <span style={{ fontFamily: MONO, fontSize: 11, color: INK.faint }}>{s.id}</span>
                    </td>
                    {people.map((p) => {
                      const has = grantedActions(CHARTER, p.roles).has(s.id);
                      return (
                        <td key={p.id} style={{ padding: '6px 8px', textAlign: 'center' }}>
                          {has ? <Chip tone="ok">✓</Chip> : <span style={{ color: INK.line }}>—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </Grid>
    </Page>
  );
};
