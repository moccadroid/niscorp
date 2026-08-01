import { z } from 'zod';
import { defineTool, type ToolDefinition } from '@niscorp/cortex';
import type { Shell, FetchFn } from '@niscorp/nova';
import { queriesNow, queryFingerprintsNow, type AvailableAction } from './knowledge';

// The assistant's hands. Two tools, and neither of them touches the screen.
//
//   query         run one of QUERIES — the caller's own vex API, replay-only,
//                 under the caller's compiled scope policy.
//   message_desk  guests only. The same messages/send write the guest's own
//                 thread uses: sender pinned server-side, stay pinned to the
//                 session. A claim of "sent" can only follow this row existing.
//
// The screen is not operated through tools. Both paths return a state and
// contract.ts applies it, so there is no push, update, pop or remove here — a
// screen described as a sequence of edits needs a guard per failure mode, and a
// declared state needs none.

export type ToolSession = { audience: string; stayId: string; propertyId: string; principal: string | null };

export const makeTools = (shell: Shell, wire: FetchFn, actions: readonly AvailableAction[], session: ToolSession): ToolDefinition[] => {
  // The data API, fetched rather than recited. It was ~1,100 tokens of prompt on
  // every run, and most runs never query — a 1-step glance at a screen is nearly
  // all prefill, so the list was latency paid for nothing. Filtered by the
  // charter, so it lists only what this person could actually read.
  const listTool = defineTool({
    id: 'assistant.listQueries',
    name: 'list_queries',
    riskLevel: 'low',
    description: 'List the vex queries you may run: fingerprint, what it answers, and the context keys it takes. Call this when you need a figure or an id you do not have.',
    input: z.object({ about: z.string().optional().describe('Optional filter — matched against the fingerprint and what it answers.') }),
    execute: ({ about }) => {
      const term = (about ?? '').trim().toLowerCase();
      const all = queriesNow(session.principal);
      const shown = term === '' ? all : all.filter((query) => `${query.fingerprint} ${query.intent}`.toLowerCase().includes(term));
      if (shown.length === 0) return `Nothing matches "${about}". Call with no filter to see all ${all.length}.`;
      return shown.map((query) => `${query.fingerprint} — ${query.intent}${query.context.length > 0 ? ` (context: ${query.context.join(', ')})` : ''}`).join('\n');
    },
  });

  const queryTool = defineTool({
    id: 'assistant.query',
    name: 'query',
    riskLevel: 'low',
    description: 'Run one of the vex queries in QUERIES. Pass its fingerprint and the context keys it lists.',
    guide:
      "The hotel's records are readable, never writable, and you read them as the signed-in person: their hotel, their rows, nothing else. `list_queries` names the reads that exist; nothing else does.\nReading is ordinary work, not a detour — a screen often carries a name where an action wants an id.",
    input: z.object({
      fingerprint: z.string().describe('a fingerprint from QUERIES'),
      context: z.record(z.string(), z.unknown()).optional().describe('the context keys that query lists'),
    }),
    execute: async ({ fingerprint, context }) => {
      if (!queryFingerprintsNow(session.principal).has(fingerprint)) return `Unknown fingerprint "${fingerprint}". Call list_queries to see what exists.`;
      // A guest's stay is theirs — a stayId they name is overwritten with the
      // session's. Staff carry no stay, so one they name passes through and
      // tenancy still holds engine-side.
      const pinned: Record<string, unknown> = { ...(context ?? {}) };
      if (session.stayId !== '' && 'stayId' in pinned) pinned['stayId'] = session.stayId;
      if ('propertyId' in pinned) pinned['propertyId'] = session.propertyId;
      try {
        const res = await wire('/api/vex', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ fingerprint, context: pinned }),
        });
        if (!res.ok) return `query failed (${res.status}): ${await res.text()}`;
        return await res.json();
      } catch (error) {
        return `query failed: ${(error as Error).message}`;
      }
    },
  });

  if (session.audience !== 'guest') return [listTool, queryTool];

  const messageTool = defineTool({
    id: 'assistant.message',
    name: 'message_desk',
    riskLevel: 'low',
    description:
      'LAST RESORT — only for what no action in ACTIONS serves. Sends a message to the front desk ON BEHALF of the guest; the desk reads it in their inbox and it appears in the guest’s thread marked as from you.',
    guide:
      'The LAST resort, not the first: if ACTIONS has one for the thing (the spa, the minibar, a wake-up call), place that instead — the guest finishes in two taps and nobody waits on a colleague. Send here only when something needs a human no action serves: a wish, a complaint, an exception. ' +
      'Write ON BEHALF, never AS the guest. Say what they want, quote their words where useful, and include every detail the desk needs to act without asking back. The desk sees room and name automatically.',
    input: z.object({ body: z.string().min(1).describe('the handoff note to the desk: what the guest wants, with all actionable details') }),
    execute: (() => {
      // An ask a live surface serves is REDIRECTED to that surface, once. The
      // latch keeps the desk reachable — a deliberate retry after reading the
      // redirect goes through — while making "forward the bookable thing" a
      // refusal the model has to read before it can insist.
      const bounced = new Set<string>();
      return async ({ body }: { body: string }) => {
        const said = body.toLowerCase();
        const served = actions.find((action) => {
          const terms = action.keywords.split(/\s+/).filter((term) => term.length >= 4);
          return terms.filter((term) => term.length >= 6 && said.includes(term)).length >= 1 || terms.filter((term) => said.includes(term)).length >= 2;
        });
        if (served !== undefined && !bounced.has(served.id)) {
          bounced.add(served.id);
          return `Not sent — this ask has its own action: place "${served.title}" (${served.id}) staged with what the conversation gave you, and the guest finishes it in a tap. Only if the guest EXPLICITLY asked you to message the desk, or this is a complaint no action can carry, send the message again.`;
        }
        const res = await wire('/api/stay/vex', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ fingerprint: 'messages/send', context: { stayId: session.stayId, sender: 'assistant', body } }),
        });
        if (!res.ok) return `message failed (${res.status}): ${await res.text()}`;
        shell.publish('messages-changed');
        return 'Message delivered to the desk — it is in their inbox and in the guest’s own thread.';
      };
    })(),
  });

  return [listTool, queryTool, messageTool];
};
