import { fillSlots } from '@layout';
import type { LayoutNode } from '@layout';
import type {
  ActionDefinition,
  ActionFragment,
  EndpointConfig,
  Step,
  TriggerConfig,
} from './schemas';

// ═══════════════════════════════════════════════════════════
// composeAction — merge a concrete action with the fragments listed in a
// push/replace `with`, producing the effective ActionDefinition to instantiate.
// Composition, not inheritance: the action ALWAYS wins on conflict.
//
//   - layout:    each fragment WRAPS the layout so far — its `{ slot: 'body' }`
//                is filled with the action's own layout (innermost). Fragments
//                fold in array order, so the last listed is the outermost wrap.
//                (Wrapping fragments must use an inline layout, not a store id.)
//   - data:      shallow-merge, action wins.
//   - triggers:  concat — fragment triggers first, then the action's.
//   - endpoints: merge, action wins on a name clash.
//   - lifecycle: per-hook concat — fragment steps run before the action's.
//   - id/name/description: the action's. The result is a plain ActionDefinition.
// ═══════════════════════════════════════════════════════════

const HOOKS = ['mount', 'unmount', 'suspend', 'resume'] as const;

export const composeAction = (
  action: ActionDefinition,
  fragments: ActionFragment[],
): ActionDefinition => {
  if (fragments.length === 0) return action;

  // Layout — wrap the action's layout in each fragment's slot.
  let layout = action.layout;
  for (const frag of fragments) {
    const wrap = frag.layout;
    if (wrap === undefined) continue;
    if (typeof wrap === 'string') {
      layout = wrap; // stored-layout fragment: can't slot-fill, replaces
      continue;
    }
    layout = fillSlots(wrap, layout === undefined ? {} : { body: layout as LayoutNode });
  }

  // Data — fragments (in order), then the action on top.
  const data: Record<string, unknown> = {};
  for (const frag of fragments) Object.assign(data, frag.data ?? {});
  Object.assign(data, action.data ?? {});

  // Triggers — fragment triggers first, then the action's.
  const triggers: TriggerConfig[] = [
    ...fragments.flatMap((f) => f.triggers ?? []),
    ...(action.triggers ?? []),
  ];

  // Endpoints — fragments, then the action (action wins on a name clash).
  const endpoints: Record<string, EndpointConfig> = {};
  for (const frag of fragments) Object.assign(endpoints, frag.endpoints ?? {});
  Object.assign(endpoints, action.endpoints ?? {});

  // Lifecycle — per hook, fragment steps before the action's.
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
    ...(layout === undefined ? {} : { layout }),
    ...(Object.keys(data).length > 0 ? { data } : {}),
    ...(triggers.length > 0 ? { triggers } : {}),
    ...(Object.keys(endpoints).length > 0 ? { endpoints } : {}),
    ...(Object.keys(lifecycle).length > 0 ? { lifecycle } : {}),
  } as ActionDefinition;
};
