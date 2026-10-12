import { z } from 'zod';
import { defineTool, type CortexEvent, type SignalClient, type ToolDefinition } from '@niscorp/cortex';
import { ActionDefinitionSchema, type Shell, type ActionDefinition } from '@niscorp/nova';
import { llmFor } from '@relay/server/llm';
import { registerCatalogEntry } from '../catalog';
import { makeArchitectTools, type QueryProof } from './tools';
import { makeArchitectAgent } from './architect.agent';
import type { RayContext } from '../engine';
import { editingGuide } from './producers';
import { validatorAgent, type ValidatorVerdict } from './validator.agent';
import { runAction } from './harness';

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

// A generated id is forced into `view.*` so it cannot overwrite a
// hand-authored screen: registerAction replaces silently.
const namespaceActionId = (definition: ActionDefinition): ActionDefinition =>
  definition.id.startsWith('view.') ? definition : { ...definition, id: `view.${definition.id}` };

// The validator needs each fingerprint's proven intent: ordering, limits and
// filters live inside the query, invisible in the definition.
export const queryIntentsOf = async (
  ray: RayContext,
  action: ActionDefinition,
): Promise<Record<string, string>> => {
  const rt = await ray.engine();
  const out: Record<string, string> = {};
  const serialized = JSON.stringify(action);
  const fps = new Set([...serialized.matchAll(/"((?:fp_[0-9a-f]{16})|(?:[a-z]+\/[A-Za-z]+))"/g)].map((m) => m[1] ?? ''));
  for (const fp of fps) {
    const entry = await rt.engine.cache.get(fp).catch(() => undefined);
    if (entry !== undefined && entry.kind === 'ok' && entry.intent !== undefined) out[fp] = entry.intent;
  }
  return out;
};

const review = async (
  ray: RayContext,
  llm: SignalClient,
  intent: string,
  action: ActionDefinition,
  report: { issues: string[]; loaded: Record<string, string> },
  opts: BuildOptions,
): Promise<ValidatorVerdict | undefined> => {
  const result = await validatorAgent.run(
    { intent, action, report: { ...report, queries: await queryIntentsOf(ray, action) } },
    {
      llm,
      ...(opts.agentPath && { agentPath: opts.agentPath }),
      ...(opts.onEvent && { onEvent: opts.onEvent }),
    },
  ).result;
  return result.ok ? result.output.data : undefined;
};

export const makeBuildActionTool = (ray: RayContext): ToolDefinition => {
  const builtActions = new Map<string, ActionDefinition>();

  return defineTool({
    id: 'ray.build',
    name: 'build_action',
    riskLevel: 'medium',
    // Above the architect's 6-minute stop plus the review and repair round, so
    // the agents' own bounds end a slow build, not this timeout.
    timeoutMs: 12 * 60_000,
    description:
      'Design a NEW interactive screen (a real Nova action, built and verified by a design agent, placed on `main`) — ' +
      'or, with `edit`, change a screen this tool built earlier.',
    guide:
      'Describe the data to show and EVERY interaction fully — e.g. "a table of the top 10 open deals by value ' +
      'showing company, stage, value and close date; click a row to open the deal". To CHANGE a screen built ' +
      'earlier, pass `edit` with its action id and describe only the change — never rebuild a working screen from ' +
      'scratch. If a build fails, report the error — the builder already continued from its best attempt; do not ' +
      're-call with the same intent. Never assemble a screen with other tools. ' +
      'Do NOT use this to open an existing screen — use `stack` for that.',
    input: z.object({
      intent: z
        .string()
        .describe('A complete description of the screen: the data (records, filters, sorting) and every interaction. In edit mode: only the change.'),
      // No transform to normalize null: tool inputs travel as JSON Schema and
      // z.toJSONSchema throws on transforms.
      edit: z
        .string()
        .nullish()
        .describe('The id of a screen this tool built earlier (e.g. "view.task-command-center") — modify that screen instead of building a new one.'),
    }),
    execute: async ({ intent, edit }, ctx) => {
      const llms = architectLlms();
      if ('error' in llms) return llms.error;

      // Models send `edit: null` for "not editing".
      const editId = edit ?? undefined;
      const base = editId !== undefined ? builtActions.get(editId) : undefined;
      if (editId !== undefined && base === undefined) {
        const known = [...builtActions.keys()].join(', ');
        return `No action "${editId}" was built in this session${known.length > 0 ? ` — built: ${known}` : ''}. Build it fresh without \`edit\`.`;
      }

      const pipelineOpts: BuildOptions = { onEvent: ctx.forward, agentPath: ctx.agentPath };

      let buildResult = await runActionArchitect(ray, llms.agent, llms.support, intent, {
        ...pipelineOpts,
        ...(base !== undefined && { base }),
      });
      if (!buildResult.ok && buildResult.candidate !== undefined) {
        const problems = buildResult.issues?.length ? buildResult.issues.join('\n') : buildResult.error;
        buildResult = await runActionArchitect(
          ray,
          llms.agent,
          llms.support,
          `Fix these problems. Keep everything else exactly as it is:\n${problems}`,
          { ...pipelineOpts, base: buildResult.candidate },
        );
      }
      if (!buildResult.ok) {
        return `build failed: ${buildResult.error}${buildResult.issues && buildResult.issues.length > 0 ? ` — ${buildResult.issues.join('; ')}` : ''}`;
      }
      let builtAction =
        base !== undefined
          ? { ...namespaceActionId(buildResult.action), id: base.id }
          : namespaceActionId(buildResult.action);

      let report = await runAction(ray, builtAction, undefined, buildResult.proofs);
      let verdict = await review(ray, llms.validator, intent, builtAction, { issues: report.issues, loaded: report.loaded }, pipelineOpts);
      const blockers = (v: ValidatorVerdict | undefined): string[] =>
        (v?.findings ?? []).filter((f) => f.severity === 'blocker').map((f) => `- ${f.fix} (intent: ${f.claim})`);
      const firstBlockers = blockers(verdict);
      if (firstBlockers.length > 0) {
        const repairResult = await runActionArchitect(ray, llms.agent, llms.support, `Fix these findings:\n${firstBlockers.join('\n')}`, {
          ...pipelineOpts,
          base: builtAction,
        });
        if (repairResult.ok) {
          builtAction = { ...namespaceActionId(repairResult.action), id: builtAction.id };
          report = await runAction(ray, builtAction, undefined, repairResult.proofs);
          verdict = await review(ray, llms.validator, intent, builtAction, { issues: report.issues, loaded: report.loaded }, pipelineOpts);
        }
      }

      builtActions.set(builtAction.id, builtAction);
      ray.shell.registerAction(builtAction);
      registerCatalogEntry({
        id: builtAction.id,
        description: builtAction.description ?? builtAction.name ?? 'Generated screen.',
        input: builtAction.input ?? {},
      });
      const remaining = blockers(verdict);
      const reviewNote =
        verdict === undefined
          ? ' (review unavailable this run)'
          : remaining.length > 0
            ? ` UNRESOLVED after one repair: ${verdict.findings
                .filter((f) => f.severity === 'blocker')
                .map((f) => f.claim)
                .join('; ')}.`
            : verdict.findings.length > 0
              ? ` Verified with minor warts: ${verdict.findings.map((f) => f.claim).join('; ')}.`
              : ' Verified: does what was asked.';
      // A screen that failed review is registered, so `edit` can repair it, but
      // not placed.
      const shipped = remaining.length === 0;
      if (shipped) ray.shell.push('main', builtAction.id);

      return {
        forModel: shipped
          ? `${base !== undefined ? 'Updated' : 'Built and placed'} "${builtAction.id}" on main.${reviewNote}${buildResult.reasoning ? ` ${buildResult.reasoning}` : ''}`
          : `NOT PLACED — "${builtAction.id}" failed review and is NOT on the canvas.${reviewNote} ` +
            'Report this to the user VERBATIM, including that the screen was not placed and what is unresolved. ' +
            'Do not summarise it as success. To fix it, call build_action again with `edit` set to this id and the unresolved findings as the change request.',
        forTrace: { action: builtAction, placed: shipped, ...(verdict !== undefined && { findings: verdict.findings }) },
      };
    },
  });
};
