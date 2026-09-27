import type { FC, ReactNode } from 'react';
import { Chip, Code, Grid, INK, Lead, Mono, Page, Panel } from '@showroom/chrome/stage/ui';

// ═══════════════════════════════════════════════════════════
// What cortex is for — the landing page.
// ═══════════════════════════════════════════════════════════

const href = (path: string): string => `${import.meta.env.BASE_URL}cortex/${path}`;

const Word: FC<{ word: string; children: ReactNode }> = ({ word, children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '104px minmax(0, 1fr)', gap: 12, padding: '10px 0', borderTop: `1px solid ${INK.line}`, fontSize: 13.5, lineHeight: 1.55 }}>
    <div style={{ fontWeight: 700 }}>{word}</div>
    <div style={{ color: INK.soft }}>{children}</div>
  </div>
);

const Step: FC<{ n: string; title: string; children: ReactNode; tone?: 'accent' | 'warn' }> = ({ n, title, children, tone = 'accent' }) => (
  <div
    style={{
      borderRadius: 12,
      padding: 14,
      background: tone === 'warn' ? INK.warnWash : INK.accentWash,
      border: `1px solid ${tone === 'warn' ? '#fde68a' : '#c7d2fe'}`,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}
  >
    <div>
      <Chip tone={tone}>{n}</Chip> <b style={{ fontSize: 13.5 }}>{title}</b>
    </div>
    <div style={{ fontSize: 13, lineHeight: 1.55 }}>{children}</div>
  </div>
);

const PAGES: readonly { to: string; title: string; blurb: string }[] = [
  { to: 'studio/front-desk', title: 'The front desk', blurb: 'Chat with the studio’s agent from a member’s phone. It uses real tools, and your code gets typed data.' },
  { to: 'studio/inbox', title: 'The inbox', blurb: 'Messy emails become typed triage cards — and an answer that doesn’t fit the schema is sent back.' },
  { to: 'studio/gate', title: 'The gate', blurb: 'An agent that can refund money stops for a person first. Approve, change the amount, or deny.' },
  { to: 'studio/delegation', title: 'Agents as tools', blurb: 'The front desk hands a billing problem to the billing agent. See who did what.' },
];

const AGENT = `defineAgent({
  id: 'studio.assistant',
  instructions: 'Look the booking up before acting. Refund only what was paid.',
  tools: [findBooking, issueRefund, sendEmail],
  output: { schema: z.object({ refunded_eur: z.number(), emailed: z.boolean() }) },
  policy: { tools: { requireApproval: ['issue_refund'] } },
})`;

export const Intro: FC = () => (
  <Page>
    <Lead eyebrow="cortex" title="Agents that call your tools — and stop to ask before the ones that matter.">
      An agent is a model in a loop: it reads the request, calls tools, reads what they returned, and answers in a shape you declared. Cortex runs
      that loop. Your policy decides which tools may run on the model’s say-so and which wait for a person — and the runtime enforces it; it is not
      a line in a prompt.
    </Lead>

    <Panel title="One agent, as data" aside="tools, an output shape, and a policy">
      <Code maxHeight={220}>{AGENT}</Code>
    </Panel>

    <Panel title="The loop, one refund">
      <Grid min={220} gap={12}>
        <Step n="1" title="The model asks">
          “Look up Ada’s booking.” Cortex checks the call against the tool’s schema and runs it.
        </Step>
        <Step n="2" title="The tool answers">
          The booking comes back as an observation — the model reads what actually happened, not what it hoped.
        </Step>
        <Step n="3" title="A gated call waits" tone="warn">
          “Refund €890.” Policy says <Mono>issue_refund</Mono> needs a person, so the run stops <i>before</i> the tool — and a person sees the number.
        </Step>
        <Step n="4" title="It answers in shape">
          Whatever the person decided is what the model is told. It finishes with the envelope you declared: text for a person, data for code.
        </Step>
      </Grid>
    </Panel>

    <Panel title="Five words">
      <div>
        <Word word="Agent">Instructions, tools, an output schema and a policy. Data you can read and review, run with any model.</Word>
        <Word word="Tool">A function with a Zod input schema and a risk level. The model can ask for it; only cortex runs it.</Word>
        <Word word="Observation">What happened when a tool was called — a result, an error or a denial — handed back to the model as fact.</Word>
        <Word word="Gate">A policy check between the model’s call and the tool: allow, deny, or wait for a person.</Word>
        <Word word="Envelope">How every agent answers: <Mono>response</Mono> for a person, <Mono>data</Mono> in your schema for code.</Word>
      </div>
    </Panel>

    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>Walk through it — no API key needed</div>
      <Grid min={320} gap={12}>
        {PAGES.map((p, i) => (
          <a
            key={p.to}
            href={href(p.to)}
            style={{ textDecoration: 'none', color: 'inherit', border: `1px solid ${INK.line}`, borderRadius: 14, padding: 16, display: 'flex', gap: 14, background: '#fff' }}
          >
            <div style={{ fontSize: 22, fontWeight: 800, color: INK.accent, lineHeight: 1 }}>{i + 1}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>{p.title} →</div>
              <div style={{ fontSize: 13, color: INK.soft, lineHeight: 1.5 }}>{p.blurb}</div>
            </div>
          </a>
        ))}
      </Grid>
    </div>
  </Page>
);
