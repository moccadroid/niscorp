import { createComponentRegistry } from '@layout/registry';
import type { ComponentRegistry } from '@layout/types';
import type { TtyComponent } from '../index';
import { ActionSlot, Badge, Box, Row, Stack, Grid, Text, Button, Input, Checkbox, Textarea, Table, Panel, JsonTree } from './components';

// ═══════════════════════════════════════════════════════════
// The default registry — the same domain-blind vocabulary as the DOM kit
// (plus Badge, which the devtools dock leans on), registered for the line
// terminal. An app's own component names fall back to their children (see
// the renderer's `fallback`).
// ═══════════════════════════════════════════════════════════

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
    // introspection primitives (used by nova/devtools; useful anywhere)
    Panel,
    JsonTree,
    // the per-instance boundary from a flattened shell tree — pass-through
    ActionSlot,
  });
  return registry;
};
