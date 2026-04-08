import { DefinitionValidationError } from '../shared/errors';
import {
  isComponentNode,
  isConditionalNode,
  isLayoutRefNode,
  isLoopNode,
} from './guards';
import { LayoutNodeSchema, type LayoutNode } from './schemas';
import type { LayoutStore } from './types';

export const createLayoutStore = (): LayoutStore => {
  const layouts = new Map<string, LayoutNode>();

  const get = (id: string): LayoutNode | undefined => layouts.get(id);

  const set = (id: string, layout: LayoutNode): void => {
    const result = LayoutNodeSchema.safeParse(layout);
    if (!result.success) {
      throw new DefinitionValidationError(`Invalid layout for id "${id}"`, {
        failures: [{ id, issues: result.error.issues }],
      });
    }
    layouts.set(id, layout);
  };

  const remove = (id: string): void => {
    layouts.delete(id);
  };

  const list = (): string[] => Array.from(layouts.keys());

  const resolveReferences = (layout: LayoutNode): LayoutNode => {
    if (isLayoutRefNode(layout)) {
      const target = layouts.get(layout.ref);
      if (target === undefined) return layout;
      return resolveReferences(target);
    }
    if (Array.isArray(layout)) {
      return layout.map(resolveReferences);
    }
    if (isComponentNode(layout)) {
      const children = layout.children;
      let resolvedChildren: LayoutNode | LayoutNode[] | undefined;
      if (children === undefined) {
        resolvedChildren = undefined;
      } else if (Array.isArray(children)) {
        resolvedChildren = children.map(resolveReferences);
      } else {
        resolvedChildren = resolveReferences(children);
      }
      return {
        ...layout,
        ...(resolvedChildren === undefined ? {} : { children: resolvedChildren }),
      };
    }
    if (isConditionalNode(layout)) {
      return {
        ...layout,
        then: resolveReferences(layout.then),
        ...(layout.else === undefined ? {} : { else: resolveReferences(layout.else) }),
      };
    }
    if (isLoopNode(layout)) {
      return {
        ...layout,
        do: resolveReferences(layout.do),
      };
    }
    return layout;
  };

  return { get, set, delete: remove, list, resolveReferences };
};
