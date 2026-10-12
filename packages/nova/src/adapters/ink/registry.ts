import { createComponentRegistry } from '@layout/registry';
import type { ComponentRegistry } from '@layout/types';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { ActionSlot, Badge, Box, Row, Stack, Grid, Text, Button, Input, Checkbox, Table, Panel, JsonTree } from './components';

export const defaultRegistry = (): ComponentRegistry<NovaComponent> => {
  const registry = createComponentRegistry<NovaComponent>();
  registry.registerAll({
    Box,
    Row,
    Stack,
    Grid,
    Text,
    Button,
    Input,
    Select: Input,
    Textarea: Input,
    Checkbox,
    Switch: Checkbox,
    Table,
    Badge,
    Panel,
    JsonTree,
    ActionSlot,
  });
  return registry;
};
