import { useRef, useState, type FC } from 'react';
import type { CortexEvent } from '@niscorp/cortex';
import { Btn, Callout, Chip, Grid, INK, Lead, MONO, Mono, Page, Panel } from '@showroom/chrome/stage/ui';
import { resolveLlm } from '../llm';
import { deskWithBilling, newStudio } from '../world/desk';
import { PhoneChat, type ChatLine } from '../world/phone-chat';

// ═══════════════════════════════════════════════════════════
// Agents as tools — the front desk hands a billing problem to a specialist.
//
// The front desk can't refund anything: it holds no refund tool. It holds the
// BILLING AGENT, wrapped as a tool. When Linus reports a double charge the desk
// delegates; the billing agent runs its own loop with its own tools, and its
// answer comes back to the desk as a tool result. The call tree is built from
// cortex's own events — every event carries the path of agents it came from.
// ═══════════════════════════════════════════════════════════

type Node = { depth: number; agent: string; label: string; tone: 'ok' | 'bad' | 'idle' | 'accent' };

const PROMPTS = ['I was charged twice this month — can you fix it?', 'How much is a monthly membership?'];

export const Delegation: FC = () => {
  const studio = useRef(newStudio());
  const [, setTick] = useState(0);
  const [lines, setLines] = useState<readonly ChatLine[]>([]);
  const [tree, setTree] = useState<readonly Node[]>([]);
  const [busy, setBusy] = useState(false);
  const { scripted } = resolveLlm();

  const send = (ask: string): void => {
    setBusy(true);
    setLines((l) => [...l, { from: 'me', text: ask }]);
    setTree([]);
    const add = (n: Node): void => setTree((t) => [...t, n]);
    const onEvent = (e: CortexEvent): void => {
      const depth = e.agentPath.length - 1;
      const agent = e.agentPath[e.agentPath.length - 1] ?? '';
      if (e.type === 'run-start') add({ depth, agent, label: `${agent} starts`, tone: 'accent' });
      if (e.type === 'tool-start') add({ depth, agent, label: `calls ${e.call.toolId}(${JSON.stringify(e.call.args)})`, tone: 'idle' });
      if (e.type === 'tool-end') {
        const o = e.observation;
        add({ depth, agent, label: o.kind === 'result' ? `← ${o.toolId}: ${JSON.stringify(o.result).slice(0, 140)}` : `✗ ${o.toolId}`, tone: o.kind === 'result' ? 'ok' : 'bad' });
      }
      if (e.type === 'run-end') add({ depth, agent, label: `${agent} answers`, tone: 'accent' });
    };
    const { llm } = resolveLlm();
    void deskWithBilling(studio.current, 'Linus', llm)
      .run(ask, { llm, onEvent })
      .result.then((r) => {
        setLines((l) => [...l, { from: 'them', text: r.ok ? String(r.output.response ?? '') : `(${r.error.message})` }]);
        setTick((n) => n + 1);
        setBusy(false);
      });
  };

  const reset = (): void => {
    studio.current = newStudio();
    setLines([]);
    setTree([]);
    setTick((n) => n + 1);
  };

  const linus = studio.current.charges.filter((c) => c.member === 'Linus');

  return (
    <Page>
      <Lead eyebrow="Agents as tools" title="The front desk can’t refund anyone. It can ask the agent who can.">
        Linus writes that he was charged twice. The front desk holds no refund tool — it holds the billing agent, wrapped as a tool. It hands the
        job over; the billing agent looks up the charges with its own tools, refunds the duplicate, and its answer comes back to the desk. The tree
        is drawn from cortex’s own events.
      </Lead>

      <Panel>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5, color: INK.soft }}>
          <Chip tone={scripted ? 'accent' : 'ok'}>{scripted ? 'scripted model' : 'live model'}</Chip>
          {scripted ? 'No API key: both agents’ words are scripted. The delegation, both loops and the tools are real cortex.' : 'Your own model, from Signal → Settings.'}
          <span style={{ flex: 1 }} />
          <Btn kind="quiet" disabled={busy} onClick={reset}>
            ↺ Reset the charges
          </Btn>
        </div>
      </Panel>

      <Grid min={320} gap={18}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <PhoneChat who="Linus" title="Ask the front desk" lines={lines} busy={busy} prompts={PROMPTS} onSend={send} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <Panel title="Who did what" aside="indented by agent — from each event’s agentPath">
            {tree.length === 0 ? (
              <div style={{ fontSize: 13, color: INK.faint }}>Ask something to see the calls.</div>
            ) : (
              tree.map((n, i) => (
                <div key={i} style={{ paddingLeft: n.depth * 22, display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, color: n.depth === 0 ? INK.accent : '#b45309', minWidth: 90 }}>{n.agent}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11.5, color: n.tone === 'ok' ? INK.ok : n.tone === 'bad' ? INK.bad : n.tone === 'accent' ? INK.text : INK.soft, fontWeight: n.tone === 'accent' ? 700 : 400, wordBreak: 'break-word' }}>
                    {n.label}
                  </span>
                </div>
              ))
            )}
          </Panel>
          <Panel title="Linus’s charges" aside="what the billing agent’s tools read and change">
            {linus.map((c) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '4px 0' }}>
                <span style={{ fontFamily: MONO, fontSize: 12 }}>{c.id}</span>
                <span>{c.date}</span>
                <span style={{ fontFamily: MONO }}>€{c.amount.toFixed(2)}</span>
                {c.refunded ? <Chip tone="ok">refunded</Chip> : <Chip>charged</Chip>}
              </div>
            ))}
          </Panel>
        </div>
      </Grid>

      <Grid min={300} gap={12}>
        <Callout tone="accent" title="Least power at the counter">
          The agent that talks to members can’t move money. The one that can is a separate agent with its own instructions, tools and policy — gate
          its refund tool and every delegated refund waits for a person.
        </Callout>
        <Callout tone="accent" title="Delegation is a tool call">
          <Mono>asTool(billingAgent)</Mono> turns an agent into a tool that takes one task. Its answer is the tool result; its events nest under the
          caller’s, so one timeline shows the whole job.
        </Callout>
      </Grid>
    </Page>
  );
};
