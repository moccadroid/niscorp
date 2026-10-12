import { defineAgent, stepCount, duration } from '@niscorp/cortex';
import type { FetchFn, Shell } from '@niscorp/nova';
import { createLlmClient } from '../llm';
import { loadActions, grantedOver } from '../knowledge';
import { makeTools } from '../tools';
import { AnswerSchema, answerSchemaFor, apply, ASSISTANT, type Answer, type Ledger } from '../contract';
import { refreshScreen, screenOf, voiceFor } from '../prompt';
import { watchContext, watchPrompt, type WatchDeps, type Trigger } from './prompt';
import { tuningFor } from '../profiles';

import type { Persona } from '../session';
import type { RunHandle, RunResult } from '@niscorp/cortex';
import { recordWake, type Outcome } from './trace';
import type { Authored } from './screen-diff';

const agents = new Map<string, ReturnType<typeof defineAgent<Answer, WatchDeps>>>();

const agentFor = (persona: Persona, places: readonly string[]): ReturnType<typeof defineAgent<Answer, WatchDeps>> => {
  const key = `${persona.name}|${persona.provider}:${persona.model}|${[...places].sort().join(',')}`;
  const existing = agents.get(key);
  if (existing !== undefined) return existing;
  const tuning = tuningFor(persona.model);
  const built = defineAgent<Answer, WatchDeps>({
    id: 'atrium.assistant.watch',
    description: "The ambient watcher on a clerk's shell — it glances, and usually changes nothing.",
    instructions: voiceFor(persona, false),
    context: watchContext,
    prepareStep: refreshScreen,
    output: { schema: answerSchemaFor(places) as unknown as typeof AnswerSchema, response: 'required' },
    stopWhen: [stepCount(tuning.steps), duration(`${tuning.seconds}s`)],
  });
  agents.set(key, built);
  return built;
};

export type RunContext = {
  shell: Shell;
  wire: FetchFn;
  post: (path: string, body: unknown) => Promise<unknown>;
  appendTurn: (role: string, body: string, origin: 'chat' | 'watch') => Promise<unknown>;
  persona: Persona;
  record: (handle: RunHandle<unknown>, result: RunResult<unknown>, persona: Persona) => void;
  principal: string;
  audience: string;
  propertyId: string;
  ledger: Ledger;
  places: readonly string[];
  signal: AbortSignal;
};

const TRIVIAL = new Set(['', '·', '.', '-']);

export const showThinking = (shell: Shell, thinking: boolean, seconds: number): void => {
  const item = shell.getState().canvases['assistant']?.stack.at(-1);
  const runtime = item === undefined ? undefined : shell.getRuntime(item.id);
  if (runtime !== undefined) runtime.setData({ ...runtime.getData(), thinking, seconds });
};

const DID_NOTHING: Authored = { wrote: new Map(), closed: new Set() };

export const runWatch = async (ctx: RunContext, trigger: Trigger): Promise<Authored> => {
  const changes = trigger.kind === 'changed' ? trigger.changes : ['the user asked for help with what is on screen'];
  // 'any' because staff slots ignore stay state; watching a non-staff audience means resolving it here.
  const actions = await loadActions(ctx.wire, ctx.audience, ctx.propertyId, 'any', await grantedOver(ctx.wire), ctx.places);
  const owned = (instanceId: string): boolean => ctx.shell.originOf(instanceId) === ASSISTANT;

  const deps: WatchDeps = {
    changes,
    screen: screenOf(ctx.shell, owned, ctx.places),
    screenNow: () => screenOf(ctx.shell, owned, ctx.places),
    refused: ctx.ledger.lines(),
    actions,
    places: ctx.places,
  };

  const tools: ReturnType<typeof makeTools> = [];
  const input = watchPrompt(trigger);
  const llm = createLlmClient(ctx.persona.provider, ctx.persona.model);
  const options = { deps, tools, signal: ctx.signal, ...(llm !== undefined ? { llm } : {}) };
  const agent = agentFor(ctx.persona, ctx.places);

  const preview = await agent.preview(input, options);
  const trace = (outcome: Outcome, reply: string): void =>
    recordWake({
      principal: ctx.principal,
      at: Date.now(),
      reasons: changes,
      outcome,
      context: preview.messages,
      estimatedTokens: preview.estimatedTokens,
      reply,
    });

  if (llm === undefined) {
    trace('no-key', '');
    return DID_NOTHING;
  }

  const startedAt = Date.now();
  const ticker = setInterval(() => showThinking(ctx.shell, true, Math.round((Date.now() - startedAt) / 1000)), 1000);
  const handle = agent.run(input, options);
  const result = await handle.result.finally(() => clearInterval(ticker));
  ctx.record(handle, result, ctx.persona);
  if (!result.ok) {
    trace(result.error.code === 'aborted' ? 'cancelled' : 'failed', result.error.message);
    return DID_NOTHING;
  }

  const answer = result.output.data ?? {};
  const applied = apply(ctx.shell, ctx.ledger, actions, { stayId: '', propertyId: ctx.propertyId }, ctx.places, answer);

  const reply = (result.output.response ?? '').trim();
  trace(applied.changed ? 'acted' : 'quiet', applied.notes.length > 0 ? `${reply} [${applied.notes.join('; ')}]` : reply);

  const asked = trigger.kind === 'asked';
  if (!asked && (!applied.changed || TRIVIAL.has(reply))) return applied;
  if (asked && TRIVIAL.has(reply)) {
    await ctx.appendTurn('assistant', 'Nothing else I can add to this screen.', 'watch');
    return applied;
  }
  await ctx.appendTurn('assistant', reply, 'watch');
  return applied;
};
