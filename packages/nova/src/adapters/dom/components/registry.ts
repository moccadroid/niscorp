import { createComponentRegistry } from '@layout/registry';
import type { ComponentRegistry } from '@layout/types';
import type { DomComponent } from '../index';
import { ActionSlot, Box, Row, Stack, Grid, Text, Button, Input, Checkbox, Textarea, Table, Panel, JsonTree } from './components';

// ═══════════════════════════════════════════════════════════
// The default registry — it only REGISTERS the components (components.ts). The
// vocabulary is domain-blind: layout, text, form, and table primitives, no
// entity nouns. Grid honors `columns`/`weights` (so tile rows and column
// layouts lay out horizontally); an app's own component names fall back to a
// div (see the renderer's `fallback`).
// ═══════════════════════════════════════════════════════════

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
    // introspection primitives (used by nova/devtools; useful anywhere)
    Panel,
    JsonTree,
    // the per-instance boundary from a flattened shell tree — pass-through
    ActionSlot,
  });
  return registry;
};
