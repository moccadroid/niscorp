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

export { Stack, StackPropsSchema, type StackProps } from './stack';

export { Text, TextPropsSchema, type TextProps } from './text';

export { Input, InputPropsSchema, type InputProps } from './input';

export { Button, ButtonPropsSchema, type ButtonProps } from './button';

export { Box, BoxPropsSchema, type BoxProps } from './box';

export { Panel, PanelPropsSchema, type PanelProps } from './panel';
export { JsonTree, JsonTreePropsSchema, type JsonTreeProps } from './json-tree';

export { CanvasSlot, CanvasSlotPropsSchema, type CanvasSlotProps } from './canvas-slot';
export { ActionSlot, ActionSlotPropsSchema, type ActionSlotProps } from './action-slot';

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
