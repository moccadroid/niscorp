import { defineAgent, stepCount, duration } from '@niscorp/cortex';
import type { FetchFn, Shell } from '@niscorp/nova';
import { createLlmClient } from '../llm';
import { loadActions, grantedOf } from '../knowledge';
import { makeTools } from '../tools';
import { AnswerSchema, answerSchemaFor, apply, ASSISTANT, type Answer, type Ledger } from '../contract';
import { refreshScreen, screenOf, voiceFor } from '../prompt';
import { watchContext, watchPrompt, type WatchDeps, type Trigger } from './prompt';
import { tuningFor } from '../profiles';

import type { Persona } from '../session';
import type { RunHandle, RunResult } from '@niscorp/cortex';
import { recordWake, type Outcome } from './trace';
import type { Authored } from './screen-diff';

// One ambient run: the watcher's OWN agent — its own prompt (./prompt), its own
// record, actions bounded by the dial's places. What it shares with the dock is
// the apply contract and the placement vocabulary, nothing else. Bounded harder
// than the dock because nobody is waiting.
//
// The context is traced whether or not a model is reached — cortex's preview is
// the same assembly the run performs, so a keyless run records the exact prompt.

// One agent per persona and profile, not per run: the identity is the
// instructions and the output schema names only the canvases that profile grants.
// Memoized so the definition (and everything cortex derives from it) is built
// once — five personas by four profiles, and one shell only ever touches one.
const agents = new Map<string, ReturnType<typeof defineAgent<Answer, WatchDeps>>>();

// The MODEL is part of the key. It decides the budget below, so two personas on
// the same name and different models are two definitions — memoizing on the name
// alone would hand the second one the first one's stop conditions.
const agentFor = (persona: Persona, places: readonly string[]): ReturnType<typeof defineAgent<Answer, WatchDeps>> => {
  const key = `${persona.name}|${persona.provider}:${persona.model}|${[...places].sort().join(',')}`;
  const existing = agents.get(key);
  if (existing !== undefined) return existing;
  const tuning = tuningFor(persona.model);
  const built = defineAgent<Answer, WatchDeps>({
    id: 'atrium.assistant.watch',
    description: "The ambient watcher on a clerk's shell — it glances, and usually changes nothing.",
    // `false`: no tools, so no sentence offering a lookup.
    instructions: voiceFor(persona, false),
    context: watchContext,
    prepareStep: refreshScreen,
    // NO `strategy`. Signal resolves the transport from what the provider and
    // the routed model can do; pinning it would make the best-equipped model
    // behave like the weakest. What a model can do is declared in profiles.ts.
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
  // Recording what the run cost, handed in by the gate — the watcher holds a
  // session but not the manifest's sink.
  record: (handle: RunHandle<unknown>, result: RunResult<unknown>, persona: Persona) => void;
  principal: string;
  audience: string;
  propertyId: string;
  ledger: Ledger;
  places: readonly string[];
  // Raised by the gate when the clerk goes somewhere else. An answer composed
  // for the screen they have left is an answer about the wrong record — the
  // Olav/Sofia failure — so the run is dropped rather than applied late.
  signal: AbortSignal;
};

const TRIVIAL = new Set(['', '·', '.', '-']);

// THE WATCHER HAS NO TOOLS. It composes from SCREEN and nothing else.
//
// A tool call costs a step out of a small ambient budget, and the screen it was
// woken by already carries what it is reacting to. Signal follows: with no tools
// the finish protocol changes shape and cortex injects no tool guides, so the
// prompt loses the vocabulary rather than keeping instructions for something
// that is not there.
//
// The dock still has them. Somebody who ASKED can wait for a lookup.

// The working indicator, written onto the dock's own data. Not published on a
// channel: nova fires a message trigger without the payload, so a count sent that
// way cannot reach a layout. Exported because the gate lights it, not the run.
export const showThinking = (shell: Shell, thinking: boolean, seconds: number): void => {
  const item = shell.getState().canvases['assistant']?.stack.at(-1);
  const runtime = item === undefined ? undefined : shell.getRuntime(item.id);
  if (runtime !== undefined) runtime.setData({ ...runtime.getData(), thinking, seconds });
};

// Everything this run did to the screen, handed back so the gate can subtract it
// from what it sees the clerk do next.
const DID_NOTHING: Authored = { wrote: new Map(), closed: new Set() };

export const runWatch = async (ctx: RunContext, trigger: Trigger): Promise<Authored> => {
  const changes = trigger.kind === 'changed' ? trigger.changes : ['the user asked for help with what is on screen'];
  // The caller's resolved surface under their own ceiling. Stay state is 'any'
  // because crew are state-blind; widening past staff means resolving it here.
  const actions = await loadActions(ctx.wire, ctx.audience, ctx.propertyId, 'any', grantedOf(ctx.principal), ctx.places);
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
    // Keyless: the gate, the context and the trace are all real; only the model
    // call is absent. Nothing is written to the transcript, because an ambient
    // run that could not look has nothing to say.
    trace('no-key', '');
    return DID_NOTHING;
  }

  const startedAt = Date.now();
  const ticker = setInterval(() => showThinking(ctx.shell, true, Math.round((Date.now() - startedAt) / 1000)), 1000);
  const handle = agent.run(input, options);
  const result = await handle.result.finally(() => clearInterval(ticker));
  ctx.record(handle, result, ctx.persona);
  if (!result.ok) {
    // A cancelled run is not a failure — it is the gate deciding the answer was
    // about to be wrong. Kept apart in the trace so a shift full of them reads
    // as a clerk moving fast rather than as a broken watcher.
    trace(result.error.code === 'aborted' ? 'cancelled' : 'failed', result.error.message);
    return DID_NOTHING;
  }

  const answer = result.output.data ?? {};
  const applied = apply(ctx.shell, ctx.ledger, actions, { stayId: '', propertyId: ctx.propertyId }, ctx.places, answer);

  const reply = (result.output.response ?? '').trim();
  trace(applied.changed ? 'acted' : 'quiet', applied.notes.length > 0 ? `${reply} [${applied.notes.join('; ')}]` : reply);

  // An AMBIENT run leaves a line only when it moved the screen; an ASKED run
  // always leaves one, so the record shows the press produced an answer. Either
  // way the line is the WATCHER'S RECORD — `origin: 'watch'`, read back by
  // `assistant/log` and the admin timeline. It is never a turn in the dock's
  // conversation: the dock renders chat rows alone, and nothing is published to
  // it from here.
  const asked = trigger.kind === 'asked';
  if (!asked && (!applied.changed || TRIVIAL.has(reply))) return applied;
  if (asked && TRIVIAL.has(reply)) {
    await ctx.appendTurn('assistant', 'Nothing else I can add to this screen.', 'watch');
    return applied;
  }
  await ctx.appendTurn('assistant', reply, 'watch');
  return applied;
};
