import { z } from 'zod';
import { defineTool, type ToolDefinition } from '@niscorp/cortex';
import type { ActionDefinition } from '@niscorp/nova';
import { buildScreen, replays, type Probe } from '@relay/screen-builder';
import { ENTRIES } from '@relay/app/vex';
import { llmFor } from '@relay/server/llm';
import type { CatalogEntry } from '../catalog';
import type { RayContext } from '../seams';
import { screenSetup } from './setup';

export { screenSetup } from './setup';

export type ScreenTools = {
  build: ToolDefinition;
  keep: ToolDefinition;
  discard: ToolDefinition;
  has: (id: string) => boolean;
  entries: () => CatalogEntry[];
};

const SHIPPED = new Set(ENTRIES.map((entry) => entry.fingerprint));

const withoutId = ({ id: _id, ...body }: ActionDefinition): Record<string, unknown> => body;

// The reads the screen replays go into the draft first, then the screen: moss checks an add against the draft as it
// stood before it. Both are shown at once and kept together by `keep`. Moss gives a new screen its id; an edit keeps it.
export const placeScreen = async (ray: Pick<RayContext, 'draft' | 'shell'>, action: ActionDefinition, editId: string | undefined): Promise<string> => {
  const reads = [...new Set(replays(action, '/api/vex'))].filter((fingerprint) => !SHIPPED.has(fingerprint)).map((fingerprint) => ({ kind: 'read' as const, id: fingerprint, body: undefined }));
  if (reads.length > 0) await ray.draft.add(reads);
  const added = await ray.draft.add([{ kind: 'action' as const, ...(editId === undefined ? {} : { id: editId }), body: withoutId(action) }]);
  const id = added.artifacts.find((artifact) => artifact.kind === 'action')?.id;
  if (id === undefined) throw new Error('the draft answered no action id');
  ray.shell.push('main', id);
  return id;
};

const entryOf = (id: string, action: ActionDefinition): CatalogEntry => ({ id, description: action.description ?? action.name ?? 'Generated screen.', input: action.input ?? {} });

const definitionOf = (version: { id: string; body: unknown }): ActionDefinition | undefined =>
  version.body !== null && typeof version.body === 'object' && !Array.isArray(version.body) ? ({ ...(version.body as Record<string, unknown>), id: version.id } as ActionDefinition) : undefined;

const saidProbe = (probe: Probe): string =>
  `${probe.do.map((step) => (step.set !== undefined ? `setting ${step.set} to ${JSON.stringify(step.to)}` : `clicking ${step.click ?? ''}`)).join(' then ')} ${probe.changes !== undefined ? `changes ${probe.changes}` : probe.opens !== undefined ? `opens ${probe.opens}` : `reloads ${probe.reloads ?? ''}`}`;

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
    timeoutMs: 12 * 60_000,
    description:
      'Design a NEW interactive screen (a real Nova action, built and checked by a design agent, placed on `main`) — ' +
      'or, with `edit`, change a screen this tool built earlier or the user kept.',
    guide:
      'Describe the data to show and EVERY interaction fully — e.g. "a table of the top 10 open deals by value ' +
      'showing company, stage, value and close date; click a row to open the deal". To CHANGE a screen, pass `edit` ' +
      'with its id (the id this tool answered, listed in ACTIONS) and describe only the change — never rebuild a working ' +
      'screen from scratch. If a build fails, report the error; do not re-call with the same intent. A built screen is shown at once and lost with the page unless kept: when the user wants ' +
      'to keep it, call keep_screens. Never assemble a screen with other tools. ' +
      'Do NOT use this to open an existing screen — use `stack` for that.',
    input: z.object({
      intent: z.string().describe('A complete description of the screen: the data (records, filters, sorting) and every interaction. In edit mode: only the change.'),
      // Not nullish: a schema that allows null is answered with null by models on Groq.
      edit: z.string().optional().describe('The id of a screen built earlier or kept (from ACTIONS) — modify that screen instead of building a new one.'),
    }),
    execute: async ({ intent, edit }, ctx) => {
      await kept;
      const llm = llmFor('architect');
      if ('error' in llm) return llm.error;
      const base = edit !== undefined ? screens.get(edit) : undefined;
      if (edit !== undefined && base === undefined) {
        const known = [...screens.keys()].join(', ');
        return `No screen "${edit}" was built in this chat or kept${known.length > 0 ? ` — screens: ${known}` : ''}. Build it fresh without \`edit\`.`;
      }

      const built = await buildScreen(intent, screenSetup(ray), { llm: llm.llm, ...(base === undefined ? {} : { base }), signal: ctx.signal, onEvent: ctx.forward, agentPath: ctx.agentPath });
      if (!built.ok) {
        return `build failed: ${built.error}${built.findings.length > 0 ? ` — its last check found: ${built.findings.map((finding) => finding.message).join('; ')}` : ''}`;
      }

      let id: string;
      try {
        id = await placeScreen(ray, built.action, edit);
      } catch (error) {
        return (
          `NOT PLACED — moss refused the screen: ${error instanceof Error ? error.message : String(error)} ` +
          'Report this to the user VERBATIM. To fix it, call build_action again with the refusal as the change request' +
          (edit === undefined ? '.' : ` and \`edit\` set to "${edit}".`)
        );
      }
      screens.set(id, { ...built.action, id });
      const probed = built.probes.length > 0 ? ` Checked by use: ${built.probes.map(saidProbe).join('; ')}.` : '';
      return {
        forModel: `${base !== undefined ? 'Updated' : 'Built and placed'} "${id}" on main.${probed} It is kept only when the user asks: then call keep_screens.`,
        forTrace: { action: { ...built.action, id }, probes: built.probes },
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
