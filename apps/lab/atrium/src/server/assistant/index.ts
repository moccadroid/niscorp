import { z } from 'zod';
import { defineAgent, stepCount, duration } from '@niscorp/cortex';
import type { Message } from '@niscorp/signal';
import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionSession } from '@niscorp/moss';
import { createLlmClient } from './llm';
import { makeTools } from './tools';
import { loadActions, grantedOver } from './knowledge';
import { assistantSession, type Persona } from './session';
import { chatPlacesFor, scopeOf, tuningFor } from './profiles';
import { AnswerSchema, answerSchemaFor, apply, ASSISTANT, createLedger, type Answer } from './contract';
import { refreshScreen, screenOf, voiceFor } from './prompt';
import { chatContext, type ChatDeps } from './chat';
import { attachWatch, kickWatch, WATCHED_AUDIENCES } from './watch';
import { meter } from './runs';

const agents = new Map<string, ReturnType<typeof defineAgent<Answer, ChatDeps>>>();

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
    output: { schema: answerSchemaFor(places) as unknown as typeof AnswerSchema, response: 'required' },
    stopWhen: [stepCount(tuning.steps + 2), duration(`${tuning.seconds * 2}s`)],
  });
  agents.set(key, built);
  return built;
};

const SendPayload = z.object({ sent: z.string().default('') }).loose();
const TurnRow = z.object({ role: z.string(), body: z.string() }).loose();

const WINDOW = 20;

export const attachAssistant = (session: FunctionSession): void => {
  const io = assistantSession(session);
  attachWatch({ session, post: io.post, appendTurn: io.appendTurn });
};

export const assistantFunctions = (session: FunctionSession): Record<string, FunctionHandler> => {
  const io = assistantSession(session);

  const ledger = createLedger();
  const record = meter(session, 'atrium.assistant', 'chat');

  const runAgent = async (transcript: Message[]): Promise<string> => {
    const me = io.user();
    if (me === undefined) return 'No session.';
    const persona = await io.persona(me.audience);
    const llm = createLlmClient(persona.provider, persona.model);
    if (llm === undefined) {
      const reply = `No ${persona.provider} key configured — set ${persona.provider === 'groq' ? 'GROQ_API_KEY' : 'OPENROUTER_API_KEY'} in the server's .env.`;
      await io.appendTurn('assistant', reply, 'chat');
      return reply;
    }

    const stayState =
      me.audience === 'guest'
        ? String(
            z
              .object({ state: z.string().default('any') })
              .loose()
              .parse((await io.post('/api/vex', { fingerprint: 'stay/current', context: { guestId: me.id } })) ?? {}).state,
          )
        : 'any';

    const places = chatPlacesFor(me.audience);
    const actions = await loadActions(session.wire, me.audience, me.propertyId, stayState, await grantedOver(session.wire), places);
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
    const reply = (result.output.response ?? '').trim() || 'Done.';
    await io.appendTurn('assistant', reply, 'chat');
    return reply;
  };

  return {
    'assistant.send': async (data) => {
      const sent = SendPayload.parse(data).sent.trim();
      if (sent === '') return { reply: '' };
      await io.appendTurn('user', sent, 'chat');
      const rows = z.array(TurnRow).parse(await io.post('/api/vex', { fingerprint: 'assistant/turns', context: {} }));
      const transcript: Message[] = rows
        .slice(-WINDOW)
        .filter((turn) => turn.role === 'user' || turn.role === 'assistant')
        .map((turn): Message => ({ role: turn.role === 'user' ? 'user' : 'assistant', content: turn.body }));
      return { reply: await runAgent(transcript) };
    },

    'assistant.nudge': async () => {
      if (session.principal === null) return { started: false };
      return { started: kickWatch(session.principal) };
    },

    'assistant.profile': async () => {
      const me = io.user();
      if (me === undefined || !WATCHED_AUDIENCES.includes(me.audience)) return { watched: false, scope: 'none' };
      const profile = await io.profile();
      return { watched: profile.watches, scope: scopeOf(profile.places) };
    },
  };
};

