import { fillSlots } from '@layout';
import type { LayoutNode } from '@layout';
import type {
  ActionDefinition,
  ActionFragment,
  EndpointConfig,
  Step,
  TriggerConfig,
} from './schemas';

const HOOKS = ['mount', 'unmount', 'suspend', 'resume'] as const;

export const composeAction = (
  action: ActionDefinition,
  fragments: ActionFragment[],
): ActionDefinition => {
  if (fragments.length === 0) return action;

  let layout = action.layout;
  for (const frag of fragments) {
    const wrap = frag.layout;
    if (wrap === undefined) continue;
    if (typeof wrap === 'string') {
      layout = wrap; // a stored layout has no slot to fill: it replaces the layout so far
      continue;
    }
    layout = fillSlots(wrap, layout === undefined ? {} : { body: layout as LayoutNode });
  }

  const data: Record<string, unknown> = {};
  for (const frag of fragments) Object.assign(data, frag.data ?? {});
  Object.assign(data, action.data ?? {});

  const triggers: TriggerConfig[] = [
    ...fragments.flatMap((f) => f.triggers ?? []),
    ...(action.triggers ?? []),
  ];

  const endpoints: Record<string, EndpointConfig> = {};
  for (const frag of fragments) Object.assign(endpoints, frag.endpoints ?? {});
  Object.assign(endpoints, action.endpoints ?? {});

  const lifecycle: Record<string, Step[]> = {};
  for (const hook of HOOKS) {
    const steps: Step[] = [
      ...fragments.flatMap((f) => f.lifecycle?.[hook] ?? []),
      ...(action.lifecycle?.[hook] ?? []),
    ];
    if (steps.length > 0) lifecycle[hook] = steps;
  }

  return {
    id: action.id,
    ...(action.name === undefined ? {} : { name: action.name }),
    ...(action.description === undefined ? {} : { description: action.description }),
    ...(action.title === undefined ? {} : { title: action.title }),
    ...(action.input === undefined ? {} : { input: action.input }),
    ...(layout === undefined ? {} : { layout }),
    ...(Object.keys(data).length > 0 ? { data } : {}),
    ...(triggers.length > 0 ? { triggers } : {}),
    ...(Object.keys(endpoints).length > 0 ? { endpoints } : {}),
    ...(Object.keys(lifecycle).length > 0 ? { lifecycle } : {}),
  } as ActionDefinition;
};
