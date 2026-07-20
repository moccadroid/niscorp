// ═══════════════════════════════════════════════════════════
// @niscorp/nova/adapters/react/components
//
// Headless React component set for Nova layouts. All five
// components carry static `.meta` (description + Zod props
// schema). The `registerNovaReactComponents` helper batches
// them into a registry via `registerAll`.
// ═══════════════════════════════════════════════════════════

import type { ComponentRegistry } from '@layout';
import type { NovaComponent } from '@react';
import { Stack } from './stack';
import { Text } from './text';
import { Input } from './input';
import { Button } from './button';
import { Box } from './box';
import { Panel } from './panel';
import { JsonTree } from './json-tree';
import { CanvasSlot } from './canvas-slot';
import { ActionSlot } from './action-slot';

// ─── Stack ─────────────────────────────────────────────────
export { Stack, StackPropsSchema, type StackProps } from './stack';

// ─── Text ──────────────────────────────────────────────────
export { Text, TextPropsSchema, type TextProps } from './text';

// ─── Input ─────────────────────────────────────────────────
export { Input, InputPropsSchema, type InputProps } from './input';

// ─── Button ────────────────────────────────────────────────
export { Button, ButtonPropsSchema, type ButtonProps } from './button';

// ─── Box ───────────────────────────────────────────────────
export { Box, BoxPropsSchema, type BoxProps } from './box';

// ─── Introspection primitives (used by nova/devtools) ──────
export { Panel, PanelPropsSchema, type PanelProps } from './panel';
export { JsonTree, JsonTreePropsSchema, type JsonTreeProps } from './json-tree';

// ─── Shell slots (react) ───────────────────────────────────
// CanvasSlot / ActionSlot are shell-aware: they pull state from
// the React shell context and must only be used inside a
// <NovaShellProvider>. Non-React adapters register their own
// equivalents implementing the same prop contract.
export { CanvasSlot, CanvasSlotPropsSchema, type CanvasSlotProps } from './canvas-slot';
export { ActionSlot, ActionSlotPropsSchema, type ActionSlotProps } from './action-slot';

// ─── Bulk registration helper ──────────────────────────────
export const registerNovaReactComponents = (
  registry: ComponentRegistry<NovaComponent>,
): void => {
  registry.registerAll({
    Stack,
    Text,
    Input,
    Button,
    Box,
    Panel,
    JsonTree,
    CanvasSlot,
    ActionSlot,
  });
};
