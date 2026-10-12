import { createComponentRegistry } from '@layout/registry';
import type { ComponentRegistry } from '@layout/types';
import type { TtyComponent } from '../index';
import { ActionSlot, Badge, Box, Row, Stack, Grid, Text, Button, Input, Checkbox, Textarea, Table, Panel, JsonTree } from './components';

export const defaultRegistry = (): ComponentRegistry<TtyComponent> => {
  const registry = createComponentRegistry<TtyComponent>();
  registry.registerAll({
    Box,
    Row,
    Stack,
    Grid,
    Text,
    Button,
    Input,
    Select: Input,
    Textarea,
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
