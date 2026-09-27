import { useState, type FC, type ReactNode } from 'react';
import { verifyCharter, type Charter, type VerifyReport } from '@niscorp/charter';
import { PhoneStyles } from '@showroom/chrome/stage/phone';
import { Btn, Callout, Chip, Code, Grid, INK, Lead, MONO, Page, Panel } from '@showroom/chrome/stage/ui';
import { StudioPhone } from '../world/screens';
import { ACTIONS, CHARTER, DATA, grantedActions, PEOPLE, type Person } from '../world/studio';

// ═══════════════════════════════════════════════════════════
// Refused before it ships.
//
// A policy's mistakes are quiet: a typo in a deny protects nothing and says
// nothing. Each scenario is one realistic edit to the studio's charter, shown
// twice — what people would get if it shipped, and what `verifyCharter` says
// at boot, where moss refuses to start on any error.
// ═══════════════════════════════════════════════════════════

type Scenario = {
  id: string;
  label: string;
  story: string;
  charter: Charter;
  changed: string;
  // Whose phone shows the consequence.
  who: string;
  without: string;
};

const SCENARIOS: readonly Scenario[] = [
  {
    id: 'typo',
    label: 'A typo in a deny',
    story:
      'Members should see everything except the staff screens, so somebody rewrites the member role as “everything, minus these”. One of the names is mistyped.',
    charter: {
      ...CHARTER,
      member: {
        actions: { allow: ['*'], deny: ['welcome', 'roster', 'members', 'revenue', 'settngs'] },
        data: ['classes.read', 'bookings.read', 'members.read', 'subscriptions.read'],
        scoping: 'personal',
      },
    },
    changed: 'member',
    who: 'mia',
    without: 'The deny for “settngs” matches nothing, so it protects nothing: Mia has a Settings tile, and nothing anywhere said so.',
  },
  {
    id: 'cycle',
    label: 'Two roles that extend each other',
    story: 'Instructors should get what owners get, “to save repeating it” — but owners already extend instructors.',
    charter: { ...CHARTER, instructor: { extends: ['owner'], actions: ['home', 'timetable', 'roster'], data: ['classes.read', 'bookings.read', 'members.read'] } },
    changed: 'instructor',
    who: 'theo',
    without: 'Nothing fails until somebody who wears one of them signs in. Then resolving their screens throws — at login, in production.',
  },
  {
    id: 'allow',
    label: 'A typo in an allow',
    story: 'The same slip on the other side: the member role’s timetable is spelled “timetabel”.',
    charter: {
      ...CHARTER,
      member: { actions: ['home', 'timetabel', 'me.*'], data: ['classes.read', 'bookings.read', 'members.read', 'subscriptions.read'], scoping: 'personal' },
    },
    changed: 'member',
    who: 'mia',
    without: 'Mia has no Timetable. Annoying, and somebody will notice by lunchtime — a missing screen is visible and safe. A missing deny was neither.',
  },
];

const Crash: FC<{ children: ReactNode }> = ({ children }) => (
  <div style={{ width: 250, maxWidth: '100%', borderRadius: 28, padding: 8, background: '#111827', boxShadow: '0 0 0 3px #ef4444' }}>
    <div style={{ borderRadius: 21, background: '#fff', minHeight: 360, padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
      <div style={{ fontSize: 30 }}>💥</div>
      <div style={{ fontSize: 15, fontWeight: 700 }}>Couldn’t sign you in</div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: INK.bad, lineHeight: 1.5 }}>{children}</div>
    </div>
  </div>
);

const Consequence: FC<{ scenario: Scenario; person: Person }> = ({ scenario, person }) => {
  try {
    grantedActions(scenario.charter, person.roles);
  } catch (error) {
    return <Crash>{error instanceof Error ? error.message : String(error)}</Crash>;
  }
  const expected = grantedActions(CHARTER, person.roles);
  return (
    <StudioPhone
      person={person}
      charter={scenario.charter}
      width={250}
      ringFor={(granted) => (granted.size !== expected.size || [...granted].some((id) => !expected.has(id)) ? 'bad' : 'plain')}
    />
  );
};

export const Refused: FC = () => {
  const [id, setId] = useState('typo');
  const scenario = SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
  if (scenario === undefined) return null;
  const person = PEOPLE.find((p) => p.id === scenario.who) ?? PEOPLE[0];
  const universes = { actions: ACTIONS, data: DATA };
  const wearable = PEOPLE.map((p) => p.roles);
  const report: VerifyReport = verifyCharter(scenario.charter, universes, wearable);
  const refused = report.errors.length > 0;
  const role = scenario.changed === '' ? undefined : scenario.charter[scenario.changed];

  return (
    <Page>
      <PhoneStyles />
      <Lead eyebrow="Refused before it ships" title="A policy’s mistakes are quiet. The verifier makes them loud — at boot, not at login.">
        A typo in a deny doesn’t fail; it just protects nothing. Each scenario is one realistic edit to the studio’s charter, shown twice: what the
        person would get if it shipped, and what <span style={{ fontFamily: MONO }}>verifyCharter</span> says — moss refuses to start on any error.
      </Lead>

      <Panel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {SCENARIOS.map((s) => (
            <Btn key={s.id} kind={s.id === scenario.id ? 'primary' : 'plain'} onClick={() => setId(s.id)}>
              {s.label}
            </Btn>
          ))}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.6 }}>{scenario.story}</div>
        {role !== undefined && <Code maxHeight={200}>{`// the edit — role "${scenario.changed}"\n"${scenario.changed}": ${JSON.stringify(role, null, 2)}`}</Code>}
      </Panel>

      <Grid min={320}>
        <Panel tone="bad" title={`If it shipped · ${person?.name ?? ''}`} aside="no verification">
          <div style={{ display: 'flex', justifyContent: 'center' }}>{person !== undefined && <Consequence scenario={scenario} person={person} />}</div>
          <Callout tone="bad">{scenario.without}</Callout>
        </Panel>
        <Panel tone={refused ? 'ok' : 'plain'} title="verifyCharter, at boot" aside={refused ? 'moss refuses to start' : 'boots — with warnings'}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Chip tone={report.errors.length > 0 ? 'bad' : 'ok'}>
              {report.errors.length} error{report.errors.length === 1 ? '' : 's'}
            </Chip>
            <Chip tone={report.warnings.length > 0 ? 'warn' : 'idle'}>
              {report.warnings.length} warning{report.warnings.length === 1 ? '' : 's'}
            </Chip>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...report.errors, ...report.warnings].map((issue, i) => (
              <div
                key={i}
                style={{
                  borderRadius: 10,
                  padding: '10px 12px',
                  background: issue.level === 'error' ? INK.badWash : INK.warnWash,
                  border: `1px solid ${issue.level === 'error' ? '#fecaca' : '#fde68a'}`,
                }}
              >
                <div style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: issue.level === 'error' ? INK.bad : INK.warn }}>
                  {issue.level} · {issue.rule}
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 2 }}>{issue.detail}</div>
              </div>
            ))}
          </div>
          <Callout tone={refused ? 'ok' : 'warn'}>
            {refused
              ? 'Caught before a single person signs in. “If it boots, it’s coherent.”'
              : 'Nothing here is dangerous, so it deploys — and the warning is on the deploy log instead of in nobody’s head.'}
          </Callout>
        </Panel>
      </Grid>
    </Page>
  );
};
