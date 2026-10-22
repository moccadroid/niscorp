import { createComponentRegistry } from '@niscorp/nova';
import type { ComponentRegistry } from '@niscorp/nova';
import { ActionSlot, CanvasSlot } from '@niscorp/nova/adapters/react/components';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { Area, Button, Card, Check, Code, Dock, Frame, Grid, Heading, Input, Menu, Page, Points, Prompt, Row, Steps, Text } from './kit';

export const buildRegistry = (): ComponentRegistry<NovaComponent> => {
  const registry = createComponentRegistry<NovaComponent>();
  registry.registerAll({ CanvasSlot, ActionSlot });
  registry.registerAll({ Page, Row, Heading, Text, Button, Frame, Dock, Menu, Grid, Area, Card, Code, Points, Steps, Check, Input, Prompt });
  return registry;
};
