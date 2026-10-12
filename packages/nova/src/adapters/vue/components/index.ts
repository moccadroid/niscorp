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

export { Panel, PanelPropsSchema, type PanelProps } from './introspection';
export { JsonTree, JsonTreePropsSchema, type JsonTreeProps } from './introspection';

export { CanvasSlot, CanvasSlotPropsSchema, type CanvasSlotProps } from './slots';
export { ActionSlot, ActionSlotPropsSchema, type ActionSlotProps } from './slots';

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
