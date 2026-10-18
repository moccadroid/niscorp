import type { TransformFn } from '@niscorp/nova';
import { evaluate } from '@niscorp/prism';
import type { DiscoveryResponse } from '@niscorp/vex';
import type { ScreenSetup } from '@relay/screen-builder';
import { buildRegistry } from '@relay/ui';
import { ENTRIES } from '@relay/app/vex';
import { todayStr } from '@relay/lib/date';
import type { RayContext } from '../seams';
import { catalogEntries, VIZ_OMIT_PROPS } from '../catalog';
import { EXAMPLES } from './examples';

const VEX = '/api/vex';

const OFFER = ['Stack', 'Row', 'Grid', 'Text', 'Badge', 'Stat', 'Avatar', 'Table', 'Input', 'Select', 'Checkbox', 'Switch', 'Button', 'Tabs', 'Progress'];

// Structural idioms only: a rule that names a domain, a screen or a task biases every screen toward it.
const LAYOUT_RULES = [
  'LAYOUT RULES:',
  '- A screen body is a Stack of sections (gap 2-4). Children of a Stack stretch to full width.',
  '- Anything that must not stretch (a Button, a small control) goes inside a Row; a Row sizes children to their content.',
  '- A Row with justify "space-between" and align "center" puts a heading on the left and controls on the right.',
  '- A metric is a Stat with the value as its children.',
  '- A ref goes on the element that is clicked, never on its container.',
  '- A Table is its own section; always set `empty`.',
].join('\n');

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

type PrismFailure = { context?: { details?: { issues?: { path: string; message: string }[] } } };

// What the session's shell does to every endpoint call: prism over the source, with the ambient values folded into a record.
const liveTransform = (ambient: Record<string, unknown>): TransformFn => (config, source) => {
  try {
    return evaluate(config as Parameters<typeof evaluate>[0], (isRecord(source) ? { ...source, ...ambient } : source) as Parameters<typeof evaluate>[1]);
  } catch (error) {
    const issues = (error as PrismFailure).context?.details?.issues ?? [];
    throw issues.length > 0 ? new Error(issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')) : error;
  }
};

const rowPayload = (row: Record<string, unknown>, props: Record<string, unknown>): unknown => {
  const key = props['clickKey'] ?? props['rowKey'] ?? 'id';
  return row[typeof key === 'string' ? key : 'id'];
};

export const screenSetup = (ray: RayContext): ScreenSetup => {
  const ambient = { userId: ray.userId, today: todayStr() };
  return {
    kit: {
      registry: buildRegistry(),
      offer: OFFER,
      omitProps: VIZ_OMIT_PROPS,
      lists: { Table: { rows: 'rows', rowRef: 'rowRef', rowPayload } },
      layoutRules: LAYOUT_RULES,
      examples: EXAMPLES,
    },
    vex: {
      endpoint: VEX,
      discover: async () => {
        const response = await ray.wire(VEX);
        if (!response.ok) throw new Error(`discovery failed (${response.status}): ${await response.text()}`);
        const found = (await response.json()) as DiscoveryResponse;
        // The queries this person may put on a screen: the ones the app ships, and the reads they saved or drafted.
        const offered = new Set([
          ...ENTRIES.map((entry) => entry.fingerprint),
          ...(await ray.artifacts.list('read')).map((version) => version.id),
          ...ray.draft.list().filter((artifact) => artifact.kind === 'read').map((artifact) => artifact.id),
        ]);
        return { ...found, fingerprints: found.fingerprints.filter((entry) => offered.has(entry.fingerprint)) };
      },
      execute: (request) =>
        ray.answerIntent(
          request.fingerprint !== undefined ? { fingerprint: request.fingerprint, context: request.context } : { intent: request.intent ?? '', shape: request.shape, context: request.context },
        ),
    },
    catalog: catalogEntries(),
    wire: ray.wire,
    transform: liveTransform(ambient),
    ambient,
  };
};
