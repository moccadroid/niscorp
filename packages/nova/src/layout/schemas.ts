import { z } from 'zod';
import { ResolvableSchema } from '../shared/bindings/schemas';

// ═══════════════════════════════════════════════════════════
// Layout node schemas
// ═══════════════════════════════════════════════════════════

export const LayoutPrimitiveSchema = z
  .union([z.string(), z.number(), z.boolean(), z.null()])
  .describe('A primitive layout value rendered as text.');

export type LayoutPrimitive = z.infer<typeof LayoutPrimitiveSchema>;

export type ComponentNode = {
  component: string;
  props?: Record<string, unknown>;
  children?: LayoutNode | LayoutNode[];
  ref?: string;
  model?: string;
  events?: Record<string, unknown>;
};

export const ComponentNodeSchema: z.ZodType<ComponentNode> = z.lazy(() =>
  z
    .object({
      component: z.string().describe('The registry name of the component to render.'),
      props: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Component props; values may be bindings to be resolved at render time.'),
      children: z
        .union([LayoutNodeSchema, z.array(LayoutNodeSchema)])
        .optional()
        .describe('Child layout content (a single node or an array of nodes).'),
      ref: z.string().optional().describe('A stable identifier used to target this component from event handlers.'),
      model: z.string().optional().describe('A two-way binding path, e.g. "$.name".'),
      events: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Map of event name to event configuration handled by the action runtime.'),
    })
    .strict()
    .describe('A node that instantiates a component from the registry.'),
);

export type ConditionalNode = {
  if: unknown;
  then: LayoutNode;
  else?: LayoutNode;
};

export const ConditionalNodeSchema: z.ZodType<ConditionalNode> = z.lazy(() =>
  z
    .object({
      if: ResolvableSchema.describe('Resolvable value evaluated for truthiness.'),
      then: LayoutNodeSchema.describe('Layout to render when condition is truthy.'),
      else: LayoutNodeSchema.optional().describe('Layout to render when condition is falsy.'),
    })
    .strict()
    .describe('A node that conditionally renders one of two branches.'),
);

export type LoopNode = {
  for: unknown;
  as: string;
  key?: string;
  do: LayoutNode;
};

export const LoopNodeSchema: z.ZodType<LoopNode> = z.lazy(() =>
  z
    .object({
      for: ResolvableSchema.describe('Resolvable value that resolves to an iterable array.'),
      as: z.string().describe('Name to bind each iterated item under in the inner scope.'),
      key: z.string().optional().describe('Optional key path on each item used for stable identity.'),
      do: LayoutNodeSchema.describe('Layout rendered once per iterated item.'),
    })
    .strict()
    .describe('A node that iterates an array binding and renders a layout for each item.'),
);

export const LayoutRefNodeSchema = z
  .object({
    ref: z.string().describe('Identifier of a layout stored in the layout store to inline at this position.'),
  })
  .strict()
  .describe('A reference to a stored layout, inlined during render.');

export type LayoutRefNode = z.infer<typeof LayoutRefNodeSchema>;

export type LayoutNode =
  | ComponentNode
  | ConditionalNode
  | LoopNode
  | LayoutRefNode
  | LayoutNode[]
  | LayoutPrimitive;

export const LayoutNodeSchema: z.ZodType<LayoutNode> = z.lazy(() =>
  z
    .union([
      ComponentNodeSchema,
      ConditionalNodeSchema,
      LoopNodeSchema,
      LayoutRefNodeSchema,
      z.array(LayoutNodeSchema),
      LayoutPrimitiveSchema,
    ])
    .describe('Any layout node: component, conditional, loop, layout ref, array of nodes, or a primitive text value.'),
);
