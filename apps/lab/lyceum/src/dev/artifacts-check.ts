import { z } from 'zod';
import { ActionDefinitionSchema, ActionFragmentSchema, LayoutNodeSchema } from '@niscorp/nova';
import { MutationDefinitionSchema, QuerySchema } from '@niscorp/vex';
import { ACTIONS } from '@lyceum/app/action-catalog';
import { ASSISTANTS } from '@lyceum/app/assistant/assistants';
import { CHARTER, WEARABLE } from '@lyceum/app/charter/charter';
import { LYCEUM_KIT } from '@lyceum/app/grammars';
import { CANVASES } from '@lyceum/app/shell/canvases';
import { frameLayout } from '@lyceum/app/shell/frame.layout';
import { FRAGMENTS } from '@lyceum/app/shell/fragments/sheet.fragment';
import { ENTRIES } from '@lyceum/app/vex';
import { QUERY_SHAPES } from '@lyceum/app/vex/query.shapes';
import { BEHAVIORS } from '@lyceum/app/vex/behaviors';
import { check, finish } from './harness';

const impurity = (value: unknown, path: string): string => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return '';
  if (typeof value === 'number') return Number.isFinite(value) ? '' : `${path} is ${value}`;
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = impurity(item, `${path}[${index}]`);
      if (found !== '') return found;
    }
    return '';
  }
  if (typeof value !== 'object') return `${path} is ${typeof value}`;
  if (Object.getPrototypeOf(value) !== Object.prototype) return `${path} is a non-plain object`;
  for (const [key, item] of Object.entries(value)) {
    const found = impurity(item, path === '' ? key : `${path}.${key}`);
    if (found !== '') return found;
  }
  return '';
};

const pure = (label: string, value: unknown): void => {
  const found = impurity(value, '');
  check(found === '' ? `${label}: pure JSON` : `${label}: IMPURE — ${found}`, found === '');
};

const parses = (label: string, parse: () => void): void => {
  try {
    parse();
    check(`${label}: parse their schema`, true);
  } catch (error) {
    check(`${label}: SCHEMA FAIL — ${error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error)}`, false);
  }
};

pure('actions', ACTIONS);
pure('charter', CHARTER);
pure('wearable role sets', WEARABLE);
pure('vex entries', ENTRIES);
pure('behaviors', BEHAVIORS);
pure('canvases', CANVASES);
pure('shell frame', frameLayout);
pure('fragments', FRAGMENTS);
pure('assistant declarations', ASSISTANTS);
pure('the kit grammar', LYCEUM_KIT);
pure('answer shapes', QUERY_SHAPES);

check('the purity check bites: a function in an action is caught', impurity({ ...ACTIONS, sneaky: { data: { format: (): string => '' } } }, '') !== '');

parses('actions', () => {
  for (const action of Object.values(ACTIONS)) ActionDefinitionSchema.parse(action);
});
parses('fragments', () => {
  for (const fragment of Object.values(FRAGMENTS)) ActionFragmentSchema.parse(fragment);
});
parses('shell frame', () => LayoutNodeSchema.parse(frameLayout));
parses('read entries', () => {
  for (const entry of ENTRIES) if ('dsl' in entry) QuerySchema.parse(entry.dsl);
});
parses('mutation entries', () => {
  for (const entry of ENTRIES) if ('mutation' in entry) MutationDefinitionSchema.parse(entry.mutation);
});

const InputSchema = z.object({ properties: z.record(z.string(), z.unknown()) });
for (const action of Object.values(ACTIONS)) {
  if (action.input === undefined) continue;
  const declared = Object.keys(InputSchema.parse(action.input).properties);
  const orphans = declared.filter((key) => !(key in (action.data ?? {})));
  check(orphans.length === 0 ? `${action.id}: input ⊆ data (${declared.join(', ')})` : `${action.id}: input declares keys its data lacks — ${orphans.join(', ')}`, orphans.length === 0);
}

finish();
