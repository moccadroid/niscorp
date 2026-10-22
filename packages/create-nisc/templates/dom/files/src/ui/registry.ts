import { createComponentRegistry, ACTION_SLOT_NAME, CANVAS_SLOT_NAME } from '@niscorp/nova';
import type { ComponentRegistry } from '@niscorp/nova';
import type { DomComponent } from '@niscorp/nova/adapters/dom';
import { fallback } from '@niscorp/nova/adapters/dom/components';
import { Area, Button, Card, Check, Code, Dock, Frame, Grid, Heading, Input, Menu, Page, Points, Prompt, Row, Steps, Text } from './kit';

// The adapter resolves a canvas slot itself, and an action slot is a plain
// wrapper: `fallback` does for both.
export const buildRegistry = (): ComponentRegistry<DomComponent> => {
  const registry = createComponentRegistry<DomComponent>();
  registry.register(CANVAS_SLOT_NAME, fallback);
  registry.register(ACTION_SLOT_NAME, fallback);
  registry.registerAll({ Page, Row, Heading, Text, Button, Frame, Dock, Menu, Grid, Area, Card, Code, Points, Steps, Check, Input, Prompt });
  return registry;
};
