import { createComponentRegistry } from '@layout/registry';
import type { ComponentRegistry } from '@layout/types';
import type { DomComponent } from '../index';
import { ActionSlot, Box, Row, Stack, Grid, Text, Button, Input, Checkbox, Textarea, Table, Panel, JsonTree } from './components';

export const defaultRegistry = (): ComponentRegistry<DomComponent> => {
  const registry = createComponentRegistry<DomComponent>();
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
    Panel,
    JsonTree,
    ActionSlot,
  });
  return registry;
};
