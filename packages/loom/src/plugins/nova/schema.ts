import { z, type ZodType } from 'zod';

// The framework-free shape of one component in the manifest: its name, the schema
// for its props, and whether it nests children. The render function (React, Vue,
// …) lives in the per-framework surface, not here.
export type NovaComponentShape = { name: string; props: ZodType; container?: boolean };

// Build the layout document's schema. Each component becomes a branch
// discriminated by its `component` literal, carrying its prop schema; containers
// recurse through `children`. This is the shape of a Nova ComponentNode, so the
// edited `layout` document is itself a layout.
export const layoutSchema = (manifest: readonly NovaComponentShape[]): ZodType => {
  const [first, ...rest] = manifest;
  if (first === undefined) throw new Error('nova plugin: the manifest is empty');

  const recur: ZodType = z.lazy(() => layoutNode);
  const branch = (component: NovaComponentShape) =>
    z.object({
      component: z.literal(component.name),
      props: component.props,
      ...(component.container === true ? { children: z.array(recur) } : {}),
    });

  const layoutNode = z.discriminatedUnion('component', [branch(first), ...rest.map(branch)]);
  return layoutNode;
};
