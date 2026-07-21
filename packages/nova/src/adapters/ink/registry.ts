import { createComponentRegistry } from '@layout/registry';
import type { ComponentRegistry } from '@layout/types';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { ActionSlot, Badge, Box, Row, Stack, Grid, Text, Button, Input, Checkbox, Table, Panel, JsonTree } from './components';

// ═══════════════════════════════════════════════════════════
// The default registry — the same domain-blind vocabulary as the DOM and TTY
// kits, registered for the full-screen terminal. An app's own component
// names fall back to their children (see the walker's `fallback`).
// ═══════════════════════════════════════════════════════════

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
    // introspection primitives (used by nova/devtools; useful anywhere)
    Panel,
    JsonTree,
    // the per-instance boundary from a flattened shell tree — pass-through
    ActionSlot,
  });
  return registry;
};
