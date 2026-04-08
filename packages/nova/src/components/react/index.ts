// ═══════════════════════════════════════════════════════════
// @niscorp/nova/components/react
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
  });
};
