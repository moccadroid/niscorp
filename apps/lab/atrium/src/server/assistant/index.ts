import { z } from 'zod';
import { defineAgent, stepCount, duration } from '@niscorp/cortex';
import type { Message } from '@niscorp/signal';
import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionSession } from '@niscorp/moss';
import { createLlmClient } from './llm';
import { makeTools } from './tools';
import { loadActions, grantedOf as grantedIds } from './knowledge';
import { assistantSession, type Persona } from './session';
import { chatPlacesFor, scopeOf, tuningFor } from './profiles';
import { AnswerSchema, answerSchemaFor, apply, ASSISTANT, createLedger, type Answer } from './contract';
import { refreshScreen, screenOf, voiceFor } from './prompt';
import { chatContext, type ChatDeps } from './chat';
import { attachWatch, kickWatch, WATCHED_AUDIENCES } from './watch';
import { meter } from './runs';
// The dock's agent — one per session, constructed with it.
//
// `assistant.send` is the whole entry: a person asks, the agent answers and
// returns the screen it wants. The WATCHER (./watch) is a separate agent with
// its own prompt, its own record and its own bounds; the two share the
// placement mechanics in contract.ts and prompt.ts and nothing else.
//
// `attachAssistant` is separate because it is NOT an endpoint — nothing calls it.
// It rides `onSession`, the one per-living-shell door moss offers.
//
// Memory is rows: chat turns land in `assistant_turns` through the governed
// wire, user-pinned by scope, so a conversation survives logout and belongs to
// one person. `assistant/turns` reads back chat turns alone — nothing the
// watcher writes rides into this agent's memory or the dock.

// One agent per persona and audience — the persona is the instructions, and the
// output schema names only the canvases that audience works in, so a clerk is
// never offered `sheet` and a guest is never offered `work`.
const agents = new Map<string, ReturnType<typeof defineAgent<Answer, ChatDeps>>>();

// Keyed by MODEL as well as persona and places — see the watcher for why. The
// dock keeps its own budget: somebody is waiting and watching a spinner, so it
// gets more room than an ambient glance and the clock is generous.
const agentFor = (persona: Persona, places: readonly string[]): ReturnType<typeof defineAgent<Answer, ChatDeps>> => {
  const key = `${persona.name}|${persona.provider}:${persona.model}|${[...places].sort().join(',')}`;
  const existing = agents.get(key);
  if (existing !== undefined) return existing;
  const tuning = tuningFor(persona.model);
  const built = defineAgent<Answer, ChatDeps>({
    id: 'atrium.assistant',
    description: 'The per-shell assistant inside atrium.',
    instructions: voiceFor(persona),
    context: chatContext,
    prepareStep: refreshScreen,
    // `response` is REQUIRED: it is the one line the person reads, and a turn
    // that finishes having said nothing reaches them as a dock answering
    // "Done." `reasoning` leads the envelope, so the model names what it is
    // doing before it does it.
    //
    // NO `strategy`: the dock HAS tools, and pinning the wire is what takes them
    // away. Resolution sends the whole envelope as `response_format` where the
    // model can combine it with tools, and falls back where it cannot. What a
    // model can do is declared in profiles.ts.
    output: { schema: answerSchemaFor(places) as unknown as typeof AnswerSchema, response: 'required' },
    stopWhen: [stepCount(tuning.steps + 2), duration(`${tuning.seconds * 2}s`)],
  });
  agents.set(key, built);
  return built;
};

const SendPayload = z.object({ sent: z.string().default('') }).loose();
const TurnRow = z.object({ role: z.string(), body: z.string() }).loose();

// How much memory rides into a run. All rows are kept forever; the model sees
// the recent window.
const WINDOW = 20;

export const attachAssistant = (session: FunctionSession): void => {
  const io = assistantSession(session);
  attachWatch({ session, post: io.post, appendTurn: io.appendTurn });
};

export const assistantFunctions = (session: FunctionSession): Record<string, FunctionHandler> => {
  const io = assistantSession(session);

  // Both agents place with the same nova origin, so they share one set of cards
  // ON THE SHELL — that, and the apply contract, is the whole overlap. What
  // stays per-agent is the refusal record: a card the person closed on one path
  // is not evidence about the other.
  const ledger = createLedger();
  const record = meter(session, 'atrium.assistant', 'chat');

  const runAgent = async (transcript: Message[]): Promise<string> => {
    const me = io.user();
    if (me === undefined) return 'No session.';
    const persona = await io.persona(me.audience);
    const llm = createLlmClient(persona.provider, persona.model);
    if (llm === undefined) {
      // Still a turn: the conversation shows the assistant saying so, once per
      // ask, instead of silently swallowing the exchange.
      const reply = `No ${persona.provider} key configured — set ${persona.provider === 'groq' ? 'GROQ_API_KEY' : 'OPENROUTER_API_KEY'} in the server's .env.`;
      await io.appendTurn('assistant', reply, 'chat');
      return reply;
    }

    // A guest's available actions depend on their stay state; staff and the
    // vendor are state-blind ('any' matches their slots).
    const stayState =
      me.audience === 'guest'
        ? String(
            z
              .object({ state: z.string().default('any') })
              .loose()
              .parse((await io.post('/api/vex', { fingerprint: 'stay/current', context: { guestId: me.id } })) ?? {}).state,
          )
        : 'any';

    // The dial in `layout_control` bounds the WATCHER, never a person's own
    // ask: the dock answers with the whole screen the asker works in. Guests
    // hold the sheet overlay; everyone else the three columns.
    const places = chatPlacesFor(me.audience);
    // `places` filters the catalog too: a surface that belongs on a canvas this
    // caller cannot place onto is not an option they have.
    const actions = await loadActions(session.wire, me.audience, me.propertyId, stayState, grantedIds(session.principal), places);
    const toolSession = { audience: me.audience, stayId: me.stayId ?? '', propertyId: me.propertyId, principal: session.principal };

    const handle = agentFor(persona, places).run(transcript, {
      llm,
      deps: {
        screen: screenOf(session.shell, (id) => session.shell.originOf(id) === ASSISTANT, places),
        screenNow: () => screenOf(session.shell, (id) => session.shell.originOf(id) === ASSISTANT, places),
        actions,
        places,
      },
      tools: makeTools(session.shell, session.wire, actions, toolSession),
    });
    const result = await handle.result;
    record(handle, result, persona);

    if (!result.ok) {
      const reply = `I hit a wall: ${result.error.message}`;
      await io.appendTurn('assistant', reply, 'chat');
      return reply;
    }

    const answer = result.output.data ?? {};
    const applied = apply(session.shell, ledger, actions, { stayId: toolSession.stayId, propertyId: me.propertyId }, places, answer);
    if (process.env['WATCH_TRACE'] === '1' && applied.notes.length > 0) console.error('[dock]', applied.notes.join('; '));
    // The envelope's own `response` is the reply — the one or two sentences the
    // person reads in the dock. A run that returns nothing still answers.
    const reply = (result.output.response ?? '').trim() || 'Done.';
    await io.appendTurn('assistant', reply, 'chat');
    return reply;
  };

  return {
    'assistant.send': async (data) => {
      const sent = SendPayload.parse(data).sent.trim();
      if (sent === '') return { reply: '' };
      await io.appendTurn('user', sent, 'chat');
      // The conversation alone. `assistant/turns` returns chat rows only, so
      // the memory this run carries is what was said between these two —
      // nothing the watcher did on its own rides in as a prior turn.
      const rows = z.array(TurnRow).parse(await io.post('/api/vex', { fingerprint: 'assistant/turns', context: {} }));
      const transcript: Message[] = rows
        .slice(-WINDOW)
        .filter((turn) => turn.role === 'user' || turn.role === 'assistant')
        .map((turn): Message => ({ role: turn.role === 'user' ? 'user' : 'assistant', content: turn.body }));
      return { reply: await runAgent(transcript) };
    },

    // The dock's second button. It runs the WATCHER, not the dock: there is no
    // question to answer, only a screen the user has judged insufficient, and
    // that is the agent built to read a screen. Nothing is appended to the
    // conversation here; a press is not something the user said.
    'assistant.nudge': async () => {
      if (session.principal === null) return { started: false };
      return { started: kickWatch(session.principal) };
    },

    // The dock's two facts about the WATCHER: whether one is on this person's
    // screen — the `nudge` button wakes it, so no watcher means no button — and
    // the territory frame's one word, derived from the dial that bounds it. The
    // dock itself needs no flag: everyone who can type gets answered.
    'assistant.profile': async () => {
      const me = io.user();
      if (me === undefined || !WATCHED_AUDIENCES.includes(me.audience)) return { watched: false, scope: 'none' };
      const profile = await io.profile();
      return { watched: profile.watches, scope: scopeOf(profile.places) };
    },
  };
};

// Ring 1 lives in knowledge.ts — both the assistant and the desk's workspace
// composition need it, and importing it from either would tie them together.
export const grantedOf = (session: FunctionSession): readonly string[] => grantedIds(session.principal);
