import { hasKey, isObject } from '../shared/common';
import type {
  ComponentNode,
  ConditionalNode,
  LayoutNode,
  LayoutPrimitive,
  LayoutRefNode,
  LoopNode,
  SlotNode,
} from './schemas';

export const isLayoutPrimitive = (value: unknown): value is LayoutPrimitive =>
  value === null ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';

export const isComponentNode = (value: unknown): value is ComponentNode =>
  hasKey(value, 'component') && typeof value['component'] === 'string';

export const isConditionalNode = (value: unknown): value is ConditionalNode =>
  hasKey(value, 'if') && hasKey(value, 'then') && !hasKey(value, 'for');

export const isLoopNode = (value: unknown): value is LoopNode =>
  hasKey(value, 'for') && hasKey(value, 'as') && hasKey(value, 'do');

export const isLayoutRefNode = (value: unknown): value is LayoutRefNode =>
  isObject(value) &&
  hasKey(value, 'ref') &&
  typeof value['ref'] === 'string' &&
  !hasKey(value, 'component') &&
  Object.keys(value).length === 1;

export const isSlotNode = (value: unknown): value is SlotNode =>
  isObject(value) &&
  hasKey(value, 'slot') &&
  typeof value['slot'] === 'string' &&
  Object.keys(value).length === 1;

export const isLayoutNode = (value: unknown): value is LayoutNode =>
  isLayoutPrimitive(value) ||
  Array.isArray(value) ||
  isComponentNode(value) ||
  isConditionalNode(value) ||
  isLoopNode(value) ||
  isLayoutRefNode(value) ||
  isSlotNode(value);
