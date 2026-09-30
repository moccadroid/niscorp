// ═══════════════════════════════════════════════════════════
// @niscorp/nova/adapters/vue/components
//
// Headless Vue component set for Nova layouts — the same vocabulary, and the
// same props schemas, as the React kit. Every component carries static
// `.meta` (description + Zod props schema). `registerNovaVueComponents`
// batches them into a registry via `registerAll`.
// ═══════════════════════════════════════════════════════════

import type { ComponentRegistry } from '@layout';
import { Box, Stack, Text } from './layout';
import { Button, Input } from './controls';
import { JsonTree, Panel } from './introspection';
import { ActionSlot, CanvasSlot } from './slots';

export { Stack, StackPropsSchema, type StackProps } from './layout';
export { Text, TextPropsSchema, type TextProps } from './layout';
export { Box, BoxPropsSchema, type BoxProps } from './layout';
export { Input, InputPropsSchema, type InputProps } from './controls';
export { Button, ButtonPropsSchema, type ButtonProps } from './controls';

// ─── Introspection primitives (used by nova/devtools) ──────
export { Panel, PanelPropsSchema, type PanelProps } from './introspection';
export { JsonTree, JsonTreePropsSchema, type JsonTreeProps } from './introspection';

// ─── Shell slots ───────────────────────────────────────────
// Shell-aware: they read the shell injection and must render inside a
// <NovaShellProvider>. A remote host registers its own pair under the names.
export { CanvasSlot, CanvasSlotPropsSchema, type CanvasSlotProps } from './slots';
export { ActionSlot, ActionSlotPropsSchema, type ActionSlotProps } from './slots';

// ─── Bulk registration helper ──────────────────────────────
// Typed over the untyped registry so it takes a kit's
// ComponentRegistry<NovaComponent> and a shell's registry alike.
export const registerNovaVueComponents = (registry: ComponentRegistry): void => {
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
