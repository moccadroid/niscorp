import { z, type ZodType } from 'zod';

export type NovaComponentShape = { name: string; props: ZodType; container?: boolean };

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
