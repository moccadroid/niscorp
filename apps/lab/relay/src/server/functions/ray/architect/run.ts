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

// ═══════════════════════════════════════════════════════════
// Drives the architect end-to-end, and exposes it to Ray as a single tool.
// This is the ONLY code that leaves the architect folder (imported by
// ray/tools.ts and the bench). Everything else is contained.
// ═══════════════════════════════════════════════════════════

// ═══ the build's three agents ═══
// The architect REASONS (design the screen, read the harness back, repair it);
// the reviewer reads the result against the intent; the transform writer does
// the legwork inside the architect's `map` tool. Three jobs, so three roles —
// which model each one runs on is the LLM seam's business (server/llm), set in
// Settings → Models and read fresh on every build.
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
  // proofs: what the build's queries PROVED (fingerprint → count +
  // context keys) — the pipeline's post-build checks diff loads
  // against them.
  | { ok: true; action: ActionDefinition; reasoning?: string; proofs: ReadonlyMap<string, QueryProof> }
  // candidate: the failed run's last schema-valid attempt (when one
  // exists) — the pipeline continues from it in EDIT mode instead of
  // rebuilding from nothing.
  | { ok: false; error: string; issues?: string[]; candidate?: ActionDefinition };

export type BuildOptions = {
  // Observe the agent's run (tool calls, retries) — build_action forwards
  // these into Ray's event stream; the bench collects them.
  onEvent?: (event: CortexEvent) => void;
  // The caller's agent path (build_action passes Ray's), so the architect's
  // events carry a nested path the trace can label.
  agentPath?: ReadonlyArray<string>;
  // EDIT mode: the existing definition to modify. It rides the intent as
  // context — the architect applies the smallest change instead of
  // rebuilding, per its own instructions.
  base?: ActionDefinition;
};

// Run the architect once. Verification happens IN the run (the agent's
// output validator mounts the candidate in a throwaway shell; failures feed
// back as corrections) and voluntarily (the run_action tool).
export const runActionArchitect = async (
  ray: RayContext,
  agentLlm: SignalClient, // the architect's own reasoning
  supportLlm: SignalClient, // its support agents (Vex synthesis, map)
  intent: string,
  opts: BuildOptions = {},
): Promise<BuildResult> => {
  const tools = makeArchitectTools(supportLlm, ray);
  // EDIT runs start from a definition whose fingerprints were proven when it
  // was BUILT — demanding they be re-proven would make every small edit
  // re-query untouched endpoints. Seed them as known (count 0: the load-diff
  // stays silent about them; the fp-scan accepts them). New fingerprints the
  // edit introduces still need real proofs from this run.
  if (opts.base !== undefined) {
    for (const [, fp] of JSON.stringify(opts.base).matchAll(/"(fp_[0-9a-f]{16})"/g)) {
      if (fp !== undefined && !tools.proofs.has(fp)) tools.proofs.set(fp, { count: 0, contextKeys: [] });
    }
  }
  const architectAgent = makeArchitectAgent(ray, tools.proofs);

  // Edit mode: the current definition rides the INPUT; the editing rules
  // ride the editingGuide PRODUCER (attached below only on edit runs), so
  // they never dilute build runs and stay one precise, named block.
  const architectInput =
    opts.base !== undefined
      ? `You are EDITING the existing action "${opts.base.id}" (see EDITING).\n\nCURRENT DEFINITION:\n${JSON.stringify(opts.base)}\n\nCHANGE REQUEST: ${intent}`
      : intent;

  // Context debugging lives in src/dev/architect-preview.ts — the exact
  // assembled prefix, printed headlessly.

  // Keep the last retry's issues so a run that exhausts its budget
  // reports WHAT kept failing, not just that it stopped.
  let lastIssues: string | undefined;
  const result = await architectAgent.run({ intent: architectInput }, {
    llm: agentLlm,
    // discover + query + run_action; `map` is a trap for the architect
    // (see tools.ts). Each tool brings its own guide.
    tools: [tools.discover, tools.query, tools.runAction],
    // Edit runs get the editing rules: right-sized change, no hotfix spirals.
    ...(opts.base !== undefined && { producers: [editingGuide] }),
    ...(opts.agentPath && { agentPath: opts.agentPath }),
    onEvent: (event) => {
      // Recovered provider rejections are corrected in-loop and are not
      // why a build failed — only output/termination issues are worth
      // reporting on failure.
      if (event.type === 'retry' && event.kind !== 'provider') lastIssues = event.issues;
      opts.onEvent?.(event);
    },
  }).result;

  if (!result.ok) {
    // The last attempt rides the error (cortex lastOutput) as either the
    // envelope or the bare payload — keep it when it parses as an action.
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

// Force a generated action's id into the `view.*` namespace so it can never
// overwrite a hand-authored screen (registerAction replaces silently).
const namespaceActionId = (definition: ActionDefinition): ActionDefinition =>
  definition.id.startsWith('view.') ? definition : { ...definition, id: `view.${definition.id}` };

// One validator pass — a pure-reader agent judging intent vs wiring. Its
// findings' `fix` lines are written for the architect (the repair run's
// change request). A validator failure is reported, never fatal: the screen
// still ships, honestly annotated.
// The proven queries behind a definition's fingerprints, as ENGLISH — the
// cache stores each query's intent. The validator needs them because
// ordering, limits and filters live INSIDE the query, invisible in the
// definition: a reviewer without this list reads "top 10 by value", finds no
// ORDER BY anywhere, and blocks a correct screen. Measured before the fix:
// it blocked every good screen it saw, always over query-resident semantics.
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

// The Ray tool. Ray delegates a "build me a screen" request here. The
// PIPELINE lives in this plain code — build → harness → review → at most ONE
// repair — composing whole agent runs deterministically; each agent is free
// inside its own run and knows nothing of the pipeline. Every nested run
// forwards into Ray's event stream (ctx.forward), so the chat trace shows
// the build, the review, and the repair live. Each agent's model comes from
// the seam (architectLlms, above), so Settings can move any of them.
export const makeBuildActionTool = (ray: RayContext): ToolDefinition => {
  // Same-session memory of what this tool built, keyed by action id — the
  // edit path reads the CURRENT definition from here, so a fix request
  // modifies the screen instead of rebuilding it from scratch.
  const builtActions = new Map<string, ActionDefinition>();

  return defineTool({
    id: 'ray.build',
    name: 'build_action',
    riskLevel: 'medium',
    // Above the architect's 6-minute stop + the review/repair round, so the
    // agents' own bounds are what end a slow build — not Ray's tool timeout.
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
      // nullish, NO transform: tool inputs travel as JSON Schema and
      // z.toJSONSchema throws on transforms. Null is normalized in execute.
      edit: z
        .string()
        .nullish()
        .describe('The id of a screen this tool built earlier (e.g. "view.task-command-center") — modify that screen instead of building a new one.'),
    }),
    execute: async ({ intent, edit }, ctx) => {
      const llms = architectLlms();
      if ('error' in llms) return llms.error;

      // Models regularly send `edit: null` for "not editing" — same as absent.
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
      // A failed build with a schema-valid candidate CONTINUES in edit
      // mode — the failed screen plus its concrete issues — instead of
      // rebuilding from nothing. One continuation, then the verdict.
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
      // Edits keep the id stable — the screen updates in place.
      let builtAction =
        base !== undefined
          ? { ...namespaceActionId(buildResult.action), id: base.id }
          : namespaceActionId(buildResult.action);

      // ── review → at most ONE repair ──
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
      // The LIVE catalog: the new screen is immediately openable/pushable by
      // Ray and legal as a push target for the next build.
      registerCatalogEntry({
        id: builtAction.id,
        description: builtAction.description ?? builtAction.name ?? 'Generated screen.',
        input: builtAction.input ?? {},
      });
      // Honest reporting: pass, pass-with-warts, unresolved blockers, or
      // review unavailable.
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
      // A SCREEN THE REVIEW FAILED IS NOT PLACED. It used to ship anyway,
      // "honestly annotated" — and the annotation did not survive: the tool
      // said UNRESOLVED, Ray summarised it as "Added the screen", and a
      // person got a broken screen with a cheerful sentence over it. A
      // screen that does not do what was asked is not a deliverable; it is
      // registered (so `edit` can repair it) but the canvas stays as it was.
      const shipped = remaining.length === 0;
      if (shipped) ray.shell.push('main', builtAction.id);

      // Traced envelope: the model gets the summary; the trace panel gets
      // the full definition + findings, so "what did it actually build?"
      // is one click away instead of invisible.
      //
      // The failure sentence is written for a person and marked DO NOT
      // SOFTEN, because the one time it mattered it was paraphrased away.
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
