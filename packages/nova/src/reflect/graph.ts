import { collectChannels } from '@action';
import type { ActionDefinition } from '@action';
import { walkNodes, isRecord } from './walk';

const navTargetsOf = (definition: ActionDefinition): string[] => {
  const out = new Set<string>();
  const scan = (value: unknown): void =>
    walkNodes(value, (record) => {
      for (const key of ['push', 'replace', 'resetTo']) {
        const target = record[key];
        if (isRecord(target) && typeof target['action'] === 'string') out.add(target['action']);
      }
    });
  scan(definition.triggers ?? []);
  scan(definition.lifecycle ?? {});
  return [...out].sort();
};

export type ActionNode = {
  id: string;
  pushes: string[];
  emits: string[];
  listens: string[];
};

export type ActionGraph = {
  nodes: ActionNode[];
  dangling: string[];
};

export const actionGraph = (
  definitions: Record<string, ActionDefinition> | readonly ActionDefinition[],
): ActionGraph => {
  const defs = Array.isArray(definitions) ? [...definitions] : Object.values(definitions);
  const known = new Set(defs.map((definition) => definition.id));
  const dangling = new Set<string>();

  const nodes = defs.map((definition): ActionNode => {
    const pushes = navTargetsOf(definition);
    for (const target of pushes) if (!target.includes('{{') && !known.has(target)) dangling.add(target);
    const usage = collectChannels(definition);
    return { id: definition.id, pushes, emits: usage.emits, listens: usage.listens };
  });

  return { nodes, dangling: [...dangling].sort() };
};
