import { createComponentRegistry } from '@niscorp/nova';
import type { ComponentRegistry } from '@niscorp/nova';
import { ActionSlot, CanvasSlot } from '@niscorp/nova/adapters/react/components';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { Answers, Area, Bar, Bars, Button, Card, Field, Frame, Heading, Input, Menu, Page, Prompt, Row, Stat, Table, Text } from './kit';

export const buildRegistry = (): ComponentRegistry<NovaComponent> => {
  const registry = createComponentRegistry<NovaComponent>();
  registry.registerAll({ CanvasSlot, ActionSlot });
  registry.registerAll({ Page, Row, Heading, Text, Button, Frame, Bar, Menu, Answers, Area, Card, Table, Stat, Bars, Input, Prompt, Field });
  return registry;
};
