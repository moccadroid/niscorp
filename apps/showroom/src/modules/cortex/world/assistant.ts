import { z } from 'zod';
import { routeResponse } from '@niscorp/signal';
import type { Capabilities, StepRequest, StepResult, StepStreamEvent, SignalDescription } from '@niscorp/signal';
import { defineAgent, defineTool, type SignalClient } from '@niscorp/cortex';

// ═══════════════════════════════════════════════════════════
// The studio assistant — an agent with three tools, one of which moves money.
//
// Everything cortex does here is real: the tool loop, the policy gate, the
// suspension, approve / approve-with-edits / deny, the observations, the
// envelope. What is scripted is the MODEL: its replies are written in advance
// (below) and branch on what cortex tells it, so the page runs with no API key.
// The scripted provider is the same shape as cortex's own test double, and it
// routes every reply through signal's real wire router.
//
// The script makes one mistake on purpose — a real one: it passes the refund in
// cents to a tool that takes euros, and proposes €890 for an €89 class.
// ═══════════════════════════════════════════════════════════

export type Refund = { at: number; to: string; amount: number };
export type Email = { at: number; to: string; subject: string; body: string };
export type World = { refunds: Refund[]; emails: Email[] };

export const newWorld = (): World => ({ refunds: [], emails: [] });

const BOOKING = { booking_id: 'b-2291', member: 'Ada', class: 'Power hour', date: 'Mon 2 March', paid_eur: 89, paid_cents: 8900 };

const toolsFor = (world: World) => [
  defineTool({
    id: 'find_booking',
    name: 'find_booking',
    description: 'Looks up a member’s booking for a class.',
    riskLevel: 'low',
    input: z.object({ member: z.string(), class: z.string() }),
    execute: () => BOOKING,
  }),
  defineTool({
    id: 'issue_refund',
    name: 'issue_refund',
    description: 'Refunds a booking. `amount` is in euros.',
    riskLevel: 'high',
    input: z.object({ booking_id: z.string(), amount: z.number().positive().describe('Euros') }),
    execute: ({ amount }) => {
      world.refunds.push({ at: Date.now(), to: BOOKING.member, amount });
      return { refunded_eur: amount, booking_id: BOOKING.booking_id };
    },
  }),
  defineTool({
    id: 'send_email',
    name: 'send_email',
    description: 'Emails a member.',
    riskLevel: 'medium',
    input: z.object({ to: z.string(), subject: z.string(), body: z.string() }),
    execute: ({ to, subject, body }) => {
      world.emails.push({ at: Date.now(), to, subject, body });
      return 'sent';
    },
  }),
];

const Outcome = z.object({ refunded_eur: z.number(), emailed: z.boolean() });

export const assistantFor = (world: World, gated: boolean) =>
  defineAgent({
    id: 'studio.assistant',
    description: 'Acme Studio’s front-desk assistant.',
    instructions:
      'You help the studio owner with members’ bookings. Look the booking up before acting. Refund only what was paid. Tell the member what happened.',
    tools: toolsFor(world),
    output: { schema: Outcome },
    ...(gated ? { policy: { tools: { requireApproval: ['issue_refund'] } } } : {}),
  });

export const REQUEST = 'Ada couldn’t make Monday’s Power hour — we cancelled it. Refund her and let her know.';

// ── the scripted model ──────────────────────────────────────────

type Call = { id: string; name: string; args: unknown };
type Turn = { text?: string; calls: Call[] };

const lastToolReply = (request: StepRequest): string | undefined => {
  const tools = request.messages.filter((m) => m.role === 'tool');
  const last = tools[tools.length - 1];
  return typeof last?.content === 'string' ? last.content : undefined;
};
const toolCallsSoFar = (request: StepRequest): number => request.messages.filter((m) => m.role === 'tool').length;

// What the model says next, given everything cortex has told it so far.
const nextTurn = (request: StepRequest): Turn => {
  const step = toolCallsSoFar(request);
  const reply = lastToolReply(request) ?? '';
  if (step === 0) {
    return { text: 'Let me find Ada’s booking first.', calls: [{ id: 'c1', name: 'find_booking', args: { member: 'Ada', class: 'Power hour' } }] };
  }
  if (step === 1) {
    // THE SLIP: the booking says paid_cents 8900 / paid_eur 89 — the model reads the wrong one.
    return { text: 'Found it — she paid for Power hour. Refunding her now.', calls: [{ id: 'c2', name: 'issue_refund', args: { booking_id: 'b-2291', amount: 890 } }] };
  }
  if (step === 2) {
    if (reply.startsWith('error: denied')) {
      const reason = reply.replace(/^error: denied:\s*/, '');
      return {
        calls: [
          {
            id: 'c4',
            name: 'respond',
            args: { response: `I didn’t refund Ada — you declined it (“${reason}”). Nothing was sent to her. Tell me the amount and I’ll try again.`, data: { refunded_eur: 0, emailed: false } },
          },
        ],
      };
    }
    let amount = 890;
    try {
      const parsed: unknown = JSON.parse(reply);
      if (typeof parsed === 'object' && parsed !== null && 'refunded_eur' in parsed && typeof parsed.refunded_eur === 'number') amount = parsed.refunded_eur;
    } catch {
      // keep the amount it asked for
    }
    return {
      text: 'Refund done. Letting Ada know.',
      calls: [
        {
          id: 'c3',
          name: 'send_email',
          args: { to: 'Ada', subject: 'Your Power hour refund', body: `Hi Ada — Monday’s Power hour was cancelled, so we’ve refunded €${amount.toFixed(2)} to your card. See you soon! — Acme Studio` },
        },
      ],
    };
  }
  let refunded = 0;
  const refundReply = request.messages.filter((m) => m.role === 'tool')[1]?.content;
  try {
    const parsed: unknown = JSON.parse(typeof refundReply === 'string' ? refundReply : '');
    if (typeof parsed === 'object' && parsed !== null && 'refunded_eur' in parsed && typeof parsed.refunded_eur === 'number') refunded = parsed.refunded_eur;
  } catch {
    // no refund recorded
  }
  return {
    calls: [{ id: 'c5', name: 'respond', args: { response: `Done — refunded €${refunded.toFixed(2)} to Ada and emailed her.`, data: { refunded_eur: refunded, emailed: true } } }],
  };
};

const CAPABILITIES: Capabilities = {
  nativeTools: true,
  nativeJsonSchema: false,
  nativeJsonMode: true,
  toolsWithStructuredOutput: false,
  validatesToolArgs: false,
  manglesNestedToolArgs: false,
  multimodal: false,
  supportsEmbedding: false,
};

const resultOf = (turn: Turn, request: StepRequest): StepResult => {
  const base: StepResult = {
    content: turn.text ?? '',
    toolCalls: turn.calls,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, reported: true },
    finishReason: turn.calls.length > 0 ? 'tool_calls' : 'stop',
    raw: null,
  };
  if (request.output === undefined) return base;
  const routed = routeResponse({
    content: base.content,
    toolCalls: base.toolCalls,
    declared: new Set((request.tools ?? []).map((t) => t.name)),
    ...(request.output.outputTool !== undefined && { outputTool: request.output.outputTool }),
    accept: request.output.accept,
    responseStrategies: [],
  });
  return { ...base, outcome: routed.outcome, wire: routed.wire };
};

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const scriptedModel = (): SignalClient => {
  const describe = (): SignalDescription => ({ provider: 'scripted', model: 'scripted — replies written in advance', kind: 'chat', capabilities: CAPABILITIES, modelKnown: false });
  return {
    describe,
    step: async (request) => resultOf(nextTurn(request), request),
    stepStream: (request): AsyncIterable<StepStreamEvent> => {
      const turn = nextTurn(request);
      return {
        [Symbol.asyncIterator]: async function* (): AsyncGenerator<StepStreamEvent> {
          // Stream the words at a readable pace, the way a model would.
          for (const word of (turn.text ?? '').split(/(?<= )/)) {
            await pause(35);
            yield { type: 'text', text: word };
          }
          for (const [index, call] of turn.calls.entries()) {
            await pause(120);
            yield { type: 'tool_call_delta', index, id: call.id, name: call.name, argsText: JSON.stringify(call.args) };
          }
          yield { type: 'done', result: resultOf(turn, request) };
        },
      };
    },
    count: async (input) => (typeof input === 'string' ? Math.ceil(input.length / 4) : input.length * 8),
  };
};
