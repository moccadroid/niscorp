import { createComponentRegistry, ACTION_SLOT_NAME, CANVAS_SLOT_NAME } from '@niscorp/nova';
import type { ComponentRegistry } from '@niscorp/nova';
import type { DomComponent } from '@niscorp/nova/adapters/dom';
import { fallback } from '@niscorp/nova/adapters/dom/components';
import { Button, Heading, Page, Row, Text } from './kit';

// The one registry, assembled once (rule 2): the kit, and nova's two slot
// markers (the adapter resolves a canvas slot itself; an action slot is a plain
// wrapper). Every component a layout may name is here, and nothing else is.
export const buildRegistry = (): ComponentRegistry<DomComponent> => {
  const registry = createComponentRegistry<DomComponent>();
  registry.register(CANVAS_SLOT_NAME, fallback);
  registry.register(ACTION_SLOT_NAME, fallback);
  registry.registerAll({ Page, Row, Heading, Text, Button });
  return registry;
};
