import type { CortexEvent, SignalClient } from '@niscorp/cortex';
import { ActionDefinitionSchema, type ActionDefinition } from '@niscorp/nova';
import { llmFor } from '@relay/server/llm';
import { ENTRIES } from '@relay/app/vex';
import { makeArchitectTools, type QueryProof } from './tools';
import { makeArchitectAgent } from './architect.agent';
import type { RayContext } from '../seams';
import { editingGuide } from './producers';
import { validatorAgent, type ValidatorVerdict } from './validator.agent';

export type BuildLlms = { agent: SignalClient; support: SignalClient; validator: SignalClient };

export const architectLlms = (): BuildLlms | { error: string } => {
  const agent = llmFor('architect');
  if ('error' in agent) return agent;
  const support = llmFor('mapping');
  if ('error' in support) return support;
  const validator = llmFor('validator');
  if ('error' in validator) return validator;
  return { agent: agent.llm, support: support.llm, validator: validator.llm };
};

export type BuildResult =
  | { ok: true; action: ActionDefinition; reasoning?: string; proofs: ReadonlyMap<string, QueryProof> }
  | { ok: false; error: string; issues?: string[]; candidate?: ActionDefinition };

export type BuildOptions = {
  onEvent?: (event: CortexEvent) => void;
  agentPath?: ReadonlyArray<string>;
  base?: ActionDefinition;
};

export const runActionArchitect = async (
  ray: RayContext,
  agentLlm: SignalClient,
  supportLlm: SignalClient,
  intent: string,
  opts: BuildOptions = {},
): Promise<BuildResult> => {
  const tools = makeArchitectTools(supportLlm, ray);
  // An edit's base fingerprints were proven when it was built: they are seeded
  // as known, with count 0 so the load diff stays silent about them.
  if (opts.base !== undefined) {
    for (const [, fp] of JSON.stringify(opts.base).matchAll(/"(fp_[0-9a-f]{16})"/g)) {
      if (fp !== undefined && !tools.proofs.has(fp)) tools.proofs.set(fp, { count: 0, contextKeys: [] });
    }
  }
  const architectAgent = makeArchitectAgent(ray, tools.proofs);

  const architectInput =
    opts.base !== undefined
      ? `You are EDITING the existing action "${opts.base.id}" (see EDITING).\n\nCURRENT DEFINITION:\n${JSON.stringify(opts.base)}\n\nCHANGE REQUEST: ${intent}`
      : intent;

  let lastIssues: string | undefined;
  const result = await architectAgent.run({ intent: architectInput }, {
    llm: agentLlm,
    // `map` is left out deliberately: it is a trap for the architect.
    tools: [tools.discover, tools.query, tools.runAction],
    ...(opts.base !== undefined && { producers: [editingGuide] }),
    ...(opts.agentPath && { agentPath: opts.agentPath }),
    onEvent: (event) => {
      if (event.type === 'retry' && event.kind !== 'provider') lastIssues = event.issues;
      opts.onEvent?.(event);
    },
  }).result;

  if (!result.ok) {
    const raw = result.error.lastOutput;
    const attempt =
      raw !== null && typeof raw === 'object' && 'data' in (raw as Record<string, unknown>)
        ? (raw as Record<string, unknown>)['data']
        : raw;
    const candidate = ActionDefinitionSchema.safeParse(attempt);
    return {
      ok: false,
      error: result.error.message,
      ...(lastIssues !== undefined && { issues: [lastIssues] }),
      ...(candidate.success && { candidate: candidate.data }),
    };
  }
  return {
    ok: true,
    action: result.output.data,
    proofs: tools.proofs,
    ...(result.output.reasoning !== undefined && { reasoning: result.output.reasoning }),
  };
};

const intentOf = (body: unknown): string | undefined =>
  body !== null && typeof body === 'object' && typeof (body as Record<string, unknown>)['intent'] === 'string' ? ((body as Record<string, unknown>)['intent'] as string) : undefined;

// The validator needs each fingerprint's proven intent: ordering, limits and
// filters live inside the query, invisible in the definition. A query the app
// ships says its intent in its entry; one vex wrote says it in the read that
// was saved or put into the draft, or in the proof of this build, which is
// where a query proved a moment ago is before the screen is placed.
export const queryIntentsOf = async (
  ray: Pick<RayContext, 'artifacts' | 'draft'>,
  action: ActionDefinition,
  proofs: ReadonlyMap<string, QueryProof> = new Map(),
): Promise<Record<string, string>> => {
  const serialized = JSON.stringify(action);
  const fps = new Set([...serialized.matchAll(/"((?:fp_[0-9a-f]{16})|(?:[a-z]+\/[A-Za-z]+))"/g)].map((m) => m[1] ?? ''));
  const known = new Map<string, string>(ENTRIES.flatMap((entry) => (entry.intent === undefined ? [] : [[entry.fingerprint, entry.intent] as const])));
  for (const version of [...(await ray.artifacts.list('read')), ...ray.draft.list().filter((artifact) => artifact.kind === 'read')]) {
    const intent = intentOf(version.body);
    if (intent !== undefined) known.set(version.id, intent);
  }
  for (const [fingerprint, proof] of proofs) if (proof.intent !== undefined) known.set(fingerprint, proof.intent);
  return Object.fromEntries([...fps].flatMap((fp) => {
    const intent = known.get(fp);
    return intent === undefined ? [] : [[fp, intent] as const];
  }));
};

export const review = async (
  ray: RayContext,
  llm: SignalClient,
  intent: string,
  action: ActionDefinition,
  report: { issues: string[]; loaded: Record<string, string> },
  opts: BuildOptions,
  proofs: ReadonlyMap<string, QueryProof> = new Map(),
): Promise<ValidatorVerdict | undefined> => {
  const result = await validatorAgent.run(
    { intent, action, report: { ...report, queries: await queryIntentsOf(ray, action, proofs) } },
    {
      llm,
      ...(opts.agentPath && { agentPath: opts.agentPath }),
      ...(opts.onEvent && { onEvent: opts.onEvent }),
    },
  ).result;
  return result.ok ? result.output.data : undefined;
};
