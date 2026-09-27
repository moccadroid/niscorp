import { createComponentRegistry } from '@niscorp/nova';
import type { ComponentRegistry } from '@niscorp/nova';
import type { DomComponent } from '@niscorp/nova/adapters/dom';
import { components } from '@niscorp/nova/adapters/dom/components';
import type { Kit } from './kit.props';

// One registry per kit, assembled once (AGENTS.md, rule 2) — the same names,
// painted by whichever kit it is given. nova's ActionSlot is the per-instance
// boundary a served tree carries; everything else is the kit's.
export const lyceumRegistry = (kit: Kit): ComponentRegistry<DomComponent> => {
  const registry = createComponentRegistry<DomComponent>();
  registry.registerAll({ ...kit, ActionSlot: components.ActionSlot });
  return registry;
};
