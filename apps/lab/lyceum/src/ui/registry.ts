import { createComponentRegistry } from '@niscorp/nova';
import type { ComponentRegistry } from '@niscorp/nova';
import type { DomComponent } from '@niscorp/nova/adapters/dom';
import { components } from '@niscorp/nova/adapters/dom/components';
import { Action, Bar, Cell, Code, Field, Figure, Headline, Label, Page, Rows, Sheet, Sigil, Text } from './kit';

// The one registry, assembled once (AGENTS.md, rule 2). nova's ActionSlot is
// the per-instance boundary a served tree carries; everything else is ours.
export const lyceumRegistry = (): ComponentRegistry<DomComponent> => {
  const registry = createComponentRegistry<DomComponent>();
  registry.registerAll({ Page, Sheet, Cell, Label, Headline, Text, Figure, Code, Sigil, Rows, Bar, Action, Field, ActionSlot: components.ActionSlot });
  return registry;
};
