import { defineAgent, repeatedCalls, stepCount, type CortexEvent, type SignalClient, type StopCondition } from '@niscorp/cortex';
import { ActionDefinitionSchema, type ActionDefinition } from '@niscorp/nova';
import { contextOf, EDITING } from './context';
import { replays } from './read';
import { AnswerSchema, checkCandidate, makeTools, newBuildState, type Answer, type BuildState } from './tools';
import type { BuildOutcome, Finding, ScreenSetup } from './types';

const INSTRUCTIONS = [
  'You build one screen, a nova action, from one request. You are done when the check passes. Hand the screen to check, or answer with it as { "action": …, "probes": [ … ] }: either way it is checked.',
  '1. discover: the entities, their fields, and the queries that exist.',
  '2. prove every dataset the screen shows. Replay a query that exists (its fingerprint) only when it answers exactly what is asked: the same rows, every filter included, in the order and form asked for. Otherwise describe a new one (intent + shape), written with real field names.',
  '3. check the complete definition with its probes. The check mounts it for real, loads its data, runs the probes and answers what broke. Fix what it names and check again. When it passes, the screen is the result and your work ends.',
  'Probes say what the screen must do when it is used: for every control or row whose trigger loads data or opens a screen, what the person does, and which data key changes or which action opens. They also say what the loaded rows must be: every filter, order and limit the request names, as claims the check verifies.',
].join('\n');

export type BuildOptions = {
  llm: SignalClient;
  // The screen being changed: the request is a change to it.
  base?: ActionDefinition;
  signal?: AbortSignal;
  onEvent?: (event: CortexEvent) => void;
  agentPath?: ReadonlyArray<string>;
};

const passedCheck = (state: BuildState): StopCondition => () => (state.passed === undefined ? null : { stop: 'custom', message: 'the screen passed its check' });

const unchangedScreen = (state: BuildState): StopCondition => () =>
  state.passed === undefined && (state.sent?.times ?? 0) >= 3 ? { stop: 'custom', message: 'the same screen came back three times in a row, unchanged by what the check found' } : null;

const runOnce = async (input: string, editing: boolean, setup: ScreenSetup, state: BuildState, options: BuildOptions): Promise<string | undefined> => {
  // The repair starts from the screen the run before ended on, so it counts its own repeats.
  state.sent = undefined;
  const agent = defineAgent<Answer>({
    id: 'screen.builder',
    description: 'Builds one nova screen from a request.',
    instructions: INSTRUCTIONS,
    context: [...contextOf(setup), ...(editing ? [EDITING] : [])],
    // An answer that carries a screen is checked like a call to check: models that answer with the screen lose no step.
    output: {
      schema: AnswerSchema,
      validate: async (envelope) => {
        if (state.passed !== undefined) return { ok: true };
        const answer = await checkCandidate(setup, state, envelope.data.action, envelope.data.probes);
        return answer.ok ? { ok: true } : { retry: `The check found: ${answer.findings.join(' | ')}` };
      },
    },
    stopWhen: [stepCount(20), repeatedCalls(2), passedCheck(state), unchangedScreen(state)],
  });
  const result = await agent.run(input, {
    llm: options.llm,
    tools: makeTools(setup, state),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.onEvent === undefined ? {} : { onEvent: options.onEvent }),
    ...(options.agentPath === undefined ? {} : { agentPath: options.agentPath }),
  }).result;
  if (state.passed !== undefined) return undefined;
  return result.ok ? 'the builder answered without a screen that passed its check' : result.error.message;
};

const changeInput = (request: string, base: ActionDefinition): string => `CHANGE: ${request}\n\nCURRENT DEFINITION:\n${JSON.stringify(base)}`;

const repairInput = (request: string, candidate: unknown, findings: readonly Finding[]): string =>
  `REQUEST: ${request}\n\nTHE LAST CHECK OF THIS SCREEN FOUND:\n${findings.map((finding) => `- ${finding.message}`).join('\n')}\n\nCURRENT DEFINITION:\n${JSON.stringify(candidate)}\n\nFix what the check found, keep the rest, and check it again.`;

// One run, and when it ends without a passing screen but with one the check found fault with, one repair of that screen.
export const buildScreen = async (request: string, setup: ScreenSetup, options: BuildOptions): Promise<BuildOutcome> => {
  const base = options.base;
  const state = newBuildState(base === undefined ? [] : replays(base, setup.vex.endpoint));

  let error = await runOnce(base === undefined ? request : changeInput(request, base), base !== undefined, setup, state, options);
  const last = state.last;
  if (error !== undefined && last !== undefined && options.signal?.aborted !== true) {
    error = await runOnce(repairInput(request, last.action, last.findings), true, setup, state, options);
  }

  const passed = state.passed;
  if (passed !== undefined) {
    const action = base === undefined ? passed.action : { ...passed.action, id: base.id };
    return { ok: true, action, probes: passed.probes, proofs: state.proofs };
  }
  const candidate = ActionDefinitionSchema.safeParse(state.last?.action);
  return { ok: false, error: error ?? 'the build ended without a screen', findings: state.last?.findings ?? [], ...(candidate.success ? { candidate: candidate.data } : {}) };
};
