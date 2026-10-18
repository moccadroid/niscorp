import { z } from 'zod';
import { defineTool, type ToolDefinition } from '@niscorp/cortex';
import type { ActionDefinition } from '@niscorp/nova';
import type { CatalogEntry } from '../catalog';
import type { RayContext } from '../seams';
import { architectLlms, review, runActionArchitect, type BuildOptions } from './run';
import { runAction } from './harness';
import type { ValidatorVerdict } from './validator.agent';

export type ScreenTools = {
  build: ToolDefinition;
  keep: ToolDefinition;
  discard: ToolDefinition;
  has: (id: string) => boolean;
  entries: () => CatalogEntry[];
};

const FINGERPRINT = /"(fp_[0-9a-f]{16})"/g;

const fingerprintsIn = (action: ActionDefinition): string[] => [...new Set([...JSON.stringify(action).matchAll(FINGERPRINT)].map((m) => m[1] ?? ''))];

const withoutId = ({ id: _id, ...body }: ActionDefinition): Record<string, unknown> => body;

// The reads the screen proved go into the draft first, then the screen: moss
// checks an add against the draft as it stood before it, and the screen's
// endpoints replay those reads. Both are shown at once, and kept together by
// `keep`. Moss gives a new screen its id; an edit keeps it.
export const placeScreen = async (ray: Pick<RayContext, 'draft' | 'shell'>, action: ActionDefinition, editId: string | undefined, placed: boolean): Promise<string> => {
  const reads = fingerprintsIn(action).map((fingerprint) => ({ kind: 'read' as const, id: fingerprint, body: undefined }));
  if (reads.length > 0) await ray.draft.add(reads);
  const added = await ray.draft.add([{ kind: 'action' as const, ...(editId === undefined ? {} : { id: editId }), body: withoutId(action) }]);
  const id = added.artifacts.find((artifact) => artifact.kind === 'action')?.id;
  if (id === undefined) throw new Error('the draft answered no action id');
  if (placed) ray.shell.push('main', id);
  return id;
};

const entryOf = (id: string, action: ActionDefinition): CatalogEntry => ({ id, description: action.description ?? action.name ?? 'Generated screen.', input: action.input ?? {} });

const definitionOf = (version: { id: string; body: unknown }): ActionDefinition | undefined =>
  version.body !== null && typeof version.body === 'object' && !Array.isArray(version.body) ? ({ ...(version.body as Record<string, unknown>), id: version.id } as ActionDefinition) : undefined;

const blockers = (verdict: ValidatorVerdict | undefined): string[] =>
  (verdict?.findings ?? []).filter((f) => f.severity === 'blocker').map((f) => `- ${f.fix} (intent: ${f.claim})`);

export const makeScreenTools = (ray: RayContext): ScreenTools => {
  // The screens of this session, by the id moss gave them: built in this chat, or kept earlier.
  const screens = new Map<string, ActionDefinition>();
  const kept = ray.artifacts.list('action').then(
    (versions) => {
      for (const version of versions) {
        const definition = definitionOf(version);
        if (definition !== undefined && !screens.has(version.id)) screens.set(version.id, definition);
      }
    },
    (error: unknown) => console.error('[relay] ray: the screens kept earlier could not be read, and are not in this chat’s list:', error),
  );

  const build = defineTool({
    id: 'ray.build',
    name: 'build_action',
    riskLevel: 'medium',
    // Above the architect's 6-minute stop plus the review and repair round, so
    // the agents' own bounds end a slow build, not this timeout.
    timeoutMs: 12 * 60_000,
    description:
      'Design a NEW interactive screen (a real Nova action, built and verified by a design agent, placed on `main`) — ' +
      'or, with `edit`, change a screen this tool built earlier or the user kept.',
    guide:
      'Describe the data to show and EVERY interaction fully — e.g. "a table of the top 10 open deals by value ' +
      'showing company, stage, value and close date; click a row to open the deal". To CHANGE a screen, pass `edit` ' +
      'with its id (the id this tool answered, listed in ACTIONS) and describe only the change — never rebuild a working ' +
      'screen from scratch. If a build fails, report the error — the builder already continued from its best attempt; do not ' +
      're-call with the same intent. A built screen is shown at once and lost with the page unless kept: when the user wants ' +
      'to keep it, call keep_screens. Never assemble a screen with other tools. ' +
      'Do NOT use this to open an existing screen — use `stack` for that.',
    input: z.object({
      intent: z
        .string()
        .describe('A complete description of the screen: the data (records, filters, sorting) and every interaction. In edit mode: only the change.'),
      // Not nullish: a schema that allows null is answered with null by models on Groq.
      edit: z
        .string()
        .optional()
        .describe('The id of a screen built earlier or kept (from ACTIONS) — modify that screen instead of building a new one.'),
    }),
    execute: async ({ intent, edit }, ctx) => {
      await kept;
      const llms = architectLlms();
      if ('error' in llms) return llms.error;

      // Models send `edit: null` for "not editing".
      const editId = edit ?? undefined;
      const base = editId !== undefined ? screens.get(editId) : undefined;
      if (editId !== undefined && base === undefined) {
        const known = [...screens.keys()].join(', ');
        return `No screen "${editId}" was built in this chat or kept${known.length > 0 ? ` — screens: ${known}` : ''}. Build it fresh without \`edit\`.`;
      }

      const pipelineOpts: BuildOptions = { onEvent: ctx.forward, agentPath: ctx.agentPath, signal: ctx.signal };

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
      let builtAction = base !== undefined ? { ...buildResult.action, id: base.id } : buildResult.action;

      let report = await runAction(ray, builtAction, undefined, buildResult.proofs);
      let verdict = await review(ray, llms.validator, intent, builtAction, { issues: report.issues, loaded: report.loaded }, pipelineOpts, buildResult.proofs);
      const firstBlockers = blockers(verdict);
      if (firstBlockers.length > 0) {
        const repairResult = await runActionArchitect(ray, llms.agent, llms.support, `Fix these findings:\n${firstBlockers.join('\n')}`, {
          ...pipelineOpts,
          base: builtAction,
        });
        if (repairResult.ok) {
          builtAction = { ...repairResult.action, id: builtAction.id };
          report = await runAction(ray, builtAction, undefined, repairResult.proofs);
          verdict = await review(ray, llms.validator, intent, builtAction, { issues: report.issues, loaded: report.loaded }, pipelineOpts, repairResult.proofs);
        }
      }

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
      // A screen that failed review is added to the draft, so `edit` can repair it, but is not placed.
      const shipped = remaining.length === 0;
      let id: string;
      try {
        id = await placeScreen(ray, builtAction, editId, shipped);
      } catch (error) {
        return (
          `NOT PLACED — moss refused the screen: ${error instanceof Error ? error.message : String(error)} ` +
          'Report this to the user VERBATIM. To fix it, call build_action again with the refusal as the change request' +
          (editId === undefined ? '.' : ` and \`edit\` set to "${editId}".`)
        );
      }
      screens.set(id, { ...builtAction, id });

      return {
        forModel: shipped
          ? `${base !== undefined ? 'Updated' : 'Built and placed'} "${id}" on main.${reviewNote}${buildResult.reasoning ? ` ${buildResult.reasoning}` : ''} It is kept only when the user asks: then call keep_screens.`
          : `NOT PLACED — "${id}" failed review and is NOT on the canvas.${reviewNote} ` +
            'Report this to the user VERBATIM, including that the screen was not placed and what is unresolved. ' +
            'Do not summarise it as success. To fix it, call build_action again with `edit` set to this id and the unresolved findings as the change request.',
        forTrace: { action: { ...builtAction, id }, placed: shipped, ...(verdict !== undefined && { findings: verdict.findings }) },
      };
    },
  });

  const keep = defineTool({
    id: 'ray.keep',
    name: 'keep_screens',
    riskLevel: 'low',
    description: 'Keep the screens built in this chat: they survive a reload and stay in ACTIONS. Call it when the user asks to keep, save or remember a screen.',
    input: z.object({}),
    execute: async () => {
      const saved = await ray.draft.save();
      const ids = saved.artifacts.filter((artifact) => artifact.kind === 'action').map((artifact) => artifact.id);
      return ids.length === 0 ? 'Nothing to keep: no screen was built since the last keep.' : `Kept ${ids.join(', ')}.`;
    },
  });

  const discard = defineTool({
    id: 'ray.discard',
    name: 'discard_screens',
    riskLevel: 'low',
    description: 'Throw away what was built in this chat and not kept. Call it when the user says so.',
    input: z.object({}),
    execute: async () => {
      const drafted = ray.draft.list().filter((artifact) => artifact.kind === 'action').map((artifact) => artifact.id);
      await ray.draft.discard();
      const saved = new Set((await ray.artifacts.list('action')).map((version) => version.id));
      for (const id of drafted) if (!saved.has(id)) screens.delete(id);
      return drafted.length === 0 ? 'Nothing to discard.' : `Discarded ${drafted.join(', ')}.`;
    },
  });

  return { build, keep, discard, has: (id) => screens.has(id), entries: () => [...screens].map(([id, action]) => entryOf(id, action)) };
};
