import { createComponentRegistry } from '@niscorp/nova';
import type { ComponentRegistry } from '@niscorp/nova';
import { ActionSlot, CanvasSlot } from '@niscorp/nova/adapters/react/components';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { Area, Button, Card, Check, Chip, Code, Deck, Dock, Frame, Grid, Heading, Input, Keys, Mini, Miniature, Page, Picture, Points, Prompt, Row, Steps, Text } from './kit';

export const buildRegistry = (): ComponentRegistry<NovaComponent> => {
  const registry = createComponentRegistry<NovaComponent>();
  registry.registerAll({ CanvasSlot, ActionSlot });
  registry.registerAll({ Page, Row, Heading, Text, Button, Chip, Frame, Dock, Grid, Area, Card, Code, Points, Steps, Check, Input, Prompt, Keys, Deck, Mini, Miniature, Picture });
  return registry;
};
