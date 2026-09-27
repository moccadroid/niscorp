import { useRef, useState, type FC } from 'react';
import type { ApprovalRequest, CortexEvent, RunHandle, RunResult, SignalClient } from '@niscorp/cortex';
import { PhoneFrame } from '@showroom/chrome/stage/phone';
import { Btn, Callout, Chip, Grid, INK, Lead, MONO, Mono, Page, Panel } from '@showroom/chrome/stage/ui';
import { buildLlm } from '../llm';
import { assistantFor, newWorld, REQUEST, scriptedModel, type World } from '../world/assistant';

// ═══════════════════════════════════════════════════════════
// The gate — an agent that can move money, with and without a person in the way.
//
// One request, two runs of the same agent side by side: on the left the refund
// tool runs when the model calls it; on the right policy marks it as needing
// approval, and the run stops before the tool executes until Olivia decides.
// ═══════════════════════════════════════════════════════════

type Bubble = { from: 'olivia' | 'assistant' | 'tool'; text: string; tone?: 'ok' | 'bad' | 'wait' };

type Lane = {
  bubbles: Bubble[];
  pending?: ApprovalRequest;
  result?: RunResult<unknown>;
  world: World;
  running: boolean;
};

const empty = (): Lane => ({ bubbles: [], world: newWorld(), running: false });

const describeCall = (toolId: string, args: unknown): string => {
  const a = typeof args === 'object' && args !== null ? Object.fromEntries(Object.entries(args)) : {};
  if (toolId === 'find_booking') return `Looking up ${String(a['member'] ?? '')}’s booking`;
  if (toolId === 'issue_refund') return `Refunding €${Number(a['amount'] ?? 0).toFixed(2)}`;
  if (toolId === 'send_email') return `Emailing ${String(a['to'] ?? '')}`;
  return toolId;
};

const Chat: FC<{ lane: Lane }> = ({ lane }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 200 }}>
    {lane.bubbles.map((b, i) =>
      b.from === 'tool' ? (
        <div key={i} style={{ alignSelf: 'center' }}>
          <Chip tone={b.tone === 'bad' ? 'bad' : b.tone === 'wait' ? 'warn' : 'ok'} mono>
            {b.text}
          </Chip>
        </div>
      ) : (
        <div
          key={i}
          style={{
            alignSelf: b.from === 'olivia' ? 'flex-end' : 'flex-start',
            maxWidth: '85%',
            padding: '8px 12px',
            borderRadius: 14,
            fontSize: 13,
            lineHeight: 1.5,
            background: b.from === 'olivia' ? INK.accent : INK.wash,
            color: b.from === 'olivia' ? '#fff' : INK.text,
            border: b.from === 'olivia' ? 'none' : `1px solid ${INK.line}`,
          }}
        >
          {b.text}
        </div>
      ),
    )}
    {lane.bubbles.length === 0 && <div style={{ fontSize: 12.5, color: INK.faint }}>Press Run.</div>}
  </div>
);

const Payments: FC<{ world: World }> = ({ world }) => (
  <div style={{ border: `1px solid ${INK.line}`, borderRadius: 10, overflow: 'hidden' }}>
    <div style={{ padding: '6px 10px', fontSize: 11, fontWeight: 650, color: INK.faint, background: INK.wash, textTransform: 'uppercase', letterSpacing: 0.5 }}>Card payments</div>
    {world.refunds.length === 0 ? (
      <div style={{ padding: '8px 10px', fontSize: 12.5, color: INK.faint }}>No refunds.</div>
    ) : (
      world.refunds.map((r, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', fontSize: 13, borderTop: `1px solid ${INK.line}` }}>
          <span>Refund to {r.to} · Power hour</span>
          <span style={{ fontFamily: MONO, fontWeight: 700, color: r.amount > 89 ? INK.bad : INK.ok }}>−€{r.amount.toFixed(2)}</span>
        </div>
      ))
    )}
  </div>
);

const AdaInbox: FC<{ world: World }> = ({ world }) => {
  const wrong = world.emails.some((e) => !e.body.includes('€89.00'));
  return (
    <PhoneFrame width={230} tone={world.emails.length === 0 ? 'plain' : wrong ? 'bad' : 'ok'} status="Ada · Mail" minHeight={170}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 16, fontWeight: 750 }}>Inbox</div>
        {world.emails.length === 0 && <div style={{ fontSize: 12, color: INK.faint }}>Nothing yet.</div>}
        {world.emails.map((e, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #eef0f3', borderRadius: 10, padding: '7px 10px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700 }}>Acme Studio</div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{e.subject}</div>
            <div style={{ fontSize: 11, color: INK.soft, lineHeight: 1.45 }}>{e.body}</div>
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
};

const Approval: FC<{ approval: ApprovalRequest; onApprove: (amount: number) => void; onDeny: (reason: string) => void }> = ({ approval, onApprove, onDeny }) => {
  const args = typeof approval.args === 'object' && approval.args !== null ? Object.fromEntries(Object.entries(approval.args)) : {};
  const asked = Number(args['amount'] ?? 0);
  const [amount, setAmount] = useState(String(asked));
  const [reason, setReason] = useState('That’s ten times what she paid.');
  const value = Number(amount);
  return (
    <div style={{ border: '2px solid #f59e0b', background: INK.warnWash, borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: INK.warn }}>⏸ Waiting for you — nothing has been refunded</div>
      <div style={{ fontSize: 15, fontWeight: 700 }}>
        The assistant wants to refund <span style={{ color: INK.bad }}>€{asked.toFixed(2)}</span> to Ada.
      </div>
      <div style={{ fontSize: 12.5, color: INK.soft }}>She paid €89.00 for the class.</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13 }}>€</span>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ font: 'inherit', fontFamily: MONO, width: 90, padding: '6px 8px', borderRadius: 8, border: `1px solid ${INK.line}` }}
        />
        <Btn kind="primary" disabled={!(value > 0)} onClick={() => onApprove(value)}>
          {value === asked ? 'Approve' : `Approve €${Number.isFinite(value) ? value.toFixed(2) : '…'} instead`}
        </Btn>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{ font: 'inherit', fontSize: 12.5, flex: 1, minWidth: 160, padding: '6px 8px', borderRadius: 8, border: `1px solid ${INK.line}` }}
        />
        <Btn onClick={() => onDeny(reason)}>Deny</Btn>
      </div>
    </div>
  );
};

export const Gate: FC = () => {
  const [open, setOpen] = useState<Lane>(empty);
  const [gated, setGated] = useState<Lane>(empty);
  const [live, setLive] = useState(false);
  const handle = useRef<RunHandle<unknown> | undefined>(undefined);
  const liveLlm = buildLlm();

  const drive = (isGated: boolean, llm: SignalClient, set: (f: (l: Lane) => Lane) => void): RunHandle<unknown> => {
    const world = newWorld();
    set(() => ({ bubbles: [{ from: 'olivia', text: REQUEST }], world, running: true }));
    const onEvent = (e: CortexEvent): void => {
      if (e.agentPath.length > 1) return;
      if (e.type === 'step-start') set((l) => ({ ...l, bubbles: [...l.bubbles, { from: 'assistant', text: '' }] }));
      if (e.type === 'model-delta' && e.channel === 'text') {
        set((l) => {
          const bubbles = [...l.bubbles];
          const last = bubbles[bubbles.length - 1];
          if (last?.from === 'assistant') bubbles[bubbles.length - 1] = { ...last, text: last.text + e.text };
          return { ...l, bubbles };
        });
      }
      if (e.type === 'tool-start' && e.call.toolId !== 'respond') set((l) => ({ ...l, bubbles: [...l.bubbles, { from: 'tool', text: `→ ${describeCall(e.call.toolId, e.call.args)}` }] }));
      if (e.type === 'approval-required') set((l) => ({ ...l, pending: e.approval, bubbles: [...l.bubbles, { from: 'tool', text: '⏸ waiting for Olivia', tone: 'wait' }] }));
      if (e.type === 'tool-end') {
        const o = e.observation;
        const text = o.kind === 'result' ? `✓ ${o.toolId}` : o.kind === 'denied' ? `✗ ${o.toolId} — denied: ${o.reason}` : `✗ ${o.toolId}`;
        set((l) => ({ ...l, world: { refunds: [...world.refunds], emails: [...world.emails] }, bubbles: [...l.bubbles, { from: 'tool', text, tone: o.kind === 'result' ? 'ok' : 'bad' }] }));
      }
    };
    const run = assistantFor(world, isGated).run(REQUEST, { llm, onEvent });
    void run.result.then((result) => {
      const response = result.ok && typeof result.output === 'object' && result.output !== null && 'response' in result.output ? String(result.output.response ?? '') : result.ok ? '' : result.error.message;
      set((l) => ({
        ...l,
        result,
        running: false,
        pending: undefined,
        world: { refunds: [...world.refunds], emails: [...world.emails] },
        bubbles: [...l.bubbles.filter((b) => !(b.from === 'assistant' && b.text === '')), { from: 'assistant', text: response }],
      }));
    });
    return run;
  };

  const run = () => {
    const llm = (): SignalClient => (live && liveLlm !== undefined ? liveLlm : scriptedModel());
    drive(false, llm(), setOpen);
    handle.current = drive(true, llm(), setGated);
  };

  const busy = open.running || gated.running;
  const clean = (l: Lane): Lane => ({ ...l, bubbles: l.bubbles.filter((b) => !(b.from === 'assistant' && b.text === '')) });

  return (
    <Page>
      <Lead eyebrow="The gate" title="An assistant that can move money should stop and ask — before, not after.">
        Olivia asks the studio assistant to refund a member for a cancelled class. The assistant has three tools: look up a booking, refund it, email
        the member. It makes one very ordinary mistake. On the left the refund tool runs when the model calls it; on the right, one line of policy
        says it needs a person first.
      </Lead>

      <Panel>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, flex: 1, minWidth: 260 }}>
            <b>Olivia:</b> “{REQUEST}”
          </div>
          <Btn kind="primary" disabled={busy} onClick={run}>
            {open.result === undefined && !busy ? '▶ Run' : '↺ Run again'}
          </Btn>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5, color: INK.soft }}>
          <Chip tone={live ? 'accent' : 'idle'}>{live ? 'live model' : 'scripted model'}</Chip>
          {live
            ? 'Your own model, from Signal → Settings. It may not make the same mistake — or any.'
            : 'The model’s replies are written in advance so this page needs no API key. Everything cortex does with them — the loop, the gate, your decision — is real.'}
          {liveLlm !== undefined && (
            <Btn kind="quiet" disabled={busy} onClick={() => setLive((v) => !v)}>
              {live ? 'Use the script' : 'Use my live model'}
            </Btn>
          )}
        </div>
      </Panel>

      <Grid min={400}>
        <Panel title="No gate" aside="the tool runs when the model calls it" tone={open.world.refunds.some((r) => r.amount > 89) ? 'bad' : 'plain'}>
          <Chat lane={clean(open)} />
          <Grid min={200} gap={12}>
            <Payments world={open.world} />
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <AdaInbox world={open.world} />
            </div>
          </Grid>
          {open.result !== undefined && open.world.refunds.some((r) => r.amount > 89) && (
            <Callout tone="bad">
              The booking listed both <Mono>paid_eur: 89</Mono> and <Mono>paid_cents: 8900</Mono>; the model read the wrong one. €890 left the
              account and Ada was told so. The first person to see the number was Ada.
            </Callout>
          )}
        </Panel>

        <Panel title="With the gate" aside={<Mono>{`policy: { tools: { requireApproval: ['issue_refund'] } }`}</Mono>} tone={gated.result !== undefined ? 'ok' : 'plain'}>
          <Chat lane={clean(gated)} />
          {gated.pending !== undefined && (
            <Approval
              key={gated.pending.id}
              approval={gated.pending}
              onApprove={(amount) => {
                const p = gated.pending;
                if (p === undefined) return;
                const args = typeof p.args === 'object' && p.args !== null ? Object.fromEntries(Object.entries(p.args)) : {};
                handle.current?.approve(p.id, { args: { ...args, amount } });
                setGated((l) => ({ ...l, pending: undefined }));
              }}
              onDeny={(reason) => {
                const p = gated.pending;
                if (p === undefined) return;
                handle.current?.deny(p.id, reason);
                setGated((l) => ({ ...l, pending: undefined }));
              }}
            />
          )}
          <Grid min={200} gap={12}>
            <Payments world={gated.world} />
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <AdaInbox world={gated.world} />
            </div>
          </Grid>
          {gated.result !== undefined && (
            <Callout tone="ok">
              {gated.world.refunds.length === 0
                ? 'Denied. The denial went back to the model as what happened — not an error — and it told Olivia so. Nothing left the account; Ada heard nothing.'
                : gated.world.refunds.every((r) => r.amount === 89)
                  ? 'Approved with an edit. The tool ran with Olivia’s amount, not the model’s, and the model carried on from what the tool actually did.'
                  : 'Approved as asked. The gate doesn’t judge — it makes sure a person did.'}
            </Callout>
          )}
        </Panel>
      </Grid>

      <Grid min={300} gap={12}>
        <Callout tone="accent" title="Before, not after">
          The gate sits between the model’s call and the tool. A suspended run holds nothing but a pending decision — it can even be saved and
          resumed later.
        </Callout>
        <Callout tone="accent" title="Three answers, one door">
          Approve, approve with changes, or deny. Whatever Olivia chose is what the model is told happened, and it continues from there.
        </Callout>
        <Callout tone="accent" title="Policy, not prompting">
          “Always ask before refunding” in the instructions is a request to the model. <Mono>requireApproval</Mono> is enforced by the runtime; the
          model cannot talk its way past it.
        </Callout>
      </Grid>
    </Page>
  );
};
