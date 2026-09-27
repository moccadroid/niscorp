import { useEffect, useState, type FC, type ReactNode } from 'react';
import { Code, Grid, INK, Lead, Mono, Page, Panel } from '@showroom/chrome/stage/ui';
import { runCron, runTide, SCENARIOS, type Side } from '../world/nights';
import { CHARGE } from '../world/billing';
import { Inbox } from './breaks-cron';

// ═══════════════════════════════════════════════════════════
// What tide is for — the landing page.
// ═══════════════════════════════════════════════════════════

const href = (path: string): string => `${import.meta.env.BASE_URL}tide/${path}`;

const Word: FC<{ word: string; children: ReactNode }> = ({ word, children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '104px minmax(0, 1fr)', gap: 12, padding: '10px 0', borderTop: `1px solid ${INK.line}`, fontSize: 13.5, lineHeight: 1.55 }}>
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

const AUTUMN = SCENARIOS.find((s) => s.id === 'autumn');

export const Intro: FC = () => {
  const [cron, setCron] = useState<Side>();
  const [tide, setTide] = useState<Side>();
  useEffect(() => {
    if (AUTUMN === undefined) return;
    setCron(runCron(AUTUMN));
    void runTide(AUTUMN).then(setTide);
  }, []);

  return (
    <Page>
      <Lead eyebrow="tide" title="Things that should happen once, on time, happen once — on time, or late and on the record.">
        Reminders at 02:30, invoices on the first, a receipt after every payment. Tide runs an app’s automations from the clock and from what
        happens in its data, and it writes every step down before it takes it. So a restart, a clock change or a bad night at the payment gateway
        cannot send anything twice or skip anything silently.
      </Lead>

      <Panel title="The problem, in one picture" aside="Grace’s inbox, the week the clocks went back">
        <Grid min={260} gap={18}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            {AUTUMN !== undefined && <Inbox scenario={AUTUMN} side={cron} shown={AUTUMN.nights.length} tone="bad" />}
            <div style={{ fontSize: 13, color: INK.soft, textAlign: 'center', maxWidth: 280 }}>
              <b style={{ color: INK.bad }}>cron.</b> On 25 October 02:30 happens twice, so the job runs twice. Every member gets Sunday’s reminder
              twice.
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            {AUTUMN !== undefined && <Inbox scenario={AUTUMN} side={tide} shown={AUTUMN.nights.length} tone="ok" />}
            <div style={{ fontSize: 13, color: INK.soft, textAlign: 'center', maxWidth: 280 }}>
              <b style={{ color: INK.ok }}>tide.</b> A night is named by its date, so it has one run whatever the clocks do.
            </div>
          </div>
        </Grid>
      </Panel>

      <Panel title="The one idea: an automation is a row">
        <div style={{ fontSize: 14.5, lineHeight: 1.65 }}>
          A <b>reflex</b> is data: when it fires, what it selects, the one effect it has. It is validated, stored, reviewed like any other artifact —
          and previewed against real data before it is switched on. Between the trigger and the effect, everything tide does is a row it commits
          first: the run, then one task per member, then the effect.
        </div>
        <Code maxHeight={260}>{JSON.stringify(CHARGE, null, 2)}</Code>
      </Panel>

      <Panel title="Five words">
        <div>
          <Word word="Reflex">One automation: a trigger — the clock, a change in the data, or a person pressing “run now” — a selection, and one effect.</Word>
          <Word word="Occurrence">One firing of a clock, named by local calendar fields: <Mono>2026-03-29</Mono>. That name is what makes it happen once.</Word>
          <Word word="Task">One unit of one run — a member on a night — written before its effect. The grain of “exactly once”.</Word>
          <Word word="Fact">Something that happened — a row written, a webhook arrived. Reflexes fire on facts, which is how one step leads to the next.</Word>
          <Word word="Catch-up">What a reflex does about the nights it missed while the server was down: run them all, run the latest, or skip — written on the reflex.</Word>
        </div>
      </Panel>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Walk through it</div>
        <Grid min={320} gap={12}>
          <Next n={1} to="studio/breaks-cron" title="What breaks cron">
            One nightly job, five bad weeks: a crash halfway, both daylight-saving nights, three nights down. Cron and tide, side by side.
          </Next>
          <Next n={2} to="studio/billing" title="The billing run">
            Preview who will be charged, then run it: a declined card and a flaky gateway, against a script that retries everything.
          </Next>
          <Next n={3} to="studio/build-a-reflex" title="Build a reflex">
            Pick when, who and how by clicking. Read the reflex you made, preview who would get what, then run a week of it onto six phones.
          </Next>
          <Next n={4} to="studio/chain" title="One booking, a chain of events">
            Mia books, cancels, the class comes and goes. Confirmations, reminders and the waitlist follow — each hop a row, none of it a script.
          </Next>
          <Next n={5} to="studio/webhook" title="The same webhook, twice">
            A payment provider sends an event twice and old news late. The usual handler double-records; tide drops the repeat and keeps the newest.
          </Next>
          <Next n={6} to="studio/digest" title="Tonight’s digest">
            Six reminders, a few failing — and one summary to Olivia when the last one lands. Retry a failure; she isn’t emailed again.
          </Next>
        </Grid>
      </div>
    </Page>
  );
};
