import type { ComponentRegistry, ComponentMeta } from '../layout/types';

export type LayoutPaletteEntry = { name: string; description: string; propsSchema?: object };

export type PaletteFromRegistryOptions = {
  include?: readonly string[];
  omitProps?: readonly string[];
};

const stripProps = (schema: object, omit: readonly string[]): object => {
  const s = schema as { properties?: Record<string, unknown>; required?: string[] };
  if (s.properties === undefined) return schema;
  const properties = { ...s.properties };
  for (const p of omit) delete properties[p];
  const required = s.required?.filter((r) => !omit.includes(r));
  return { ...s, properties, ...(required !== undefined ? { required } : {}) };
};

export const paletteEntryOf = (name: string, meta: ComponentMeta, omitProps?: readonly string[]): LayoutPaletteEntry => {
  let propsSchema: object | undefined;
  if (meta.propsSchema !== undefined) {
    // The app's schema converts itself (Standard JSON Schema): it may come from
    // the app's zod copy, and ours would read that copy's metadata through our registry.
    const js = meta.propsSchema['~standard'].jsonSchema.output({ target: 'draft-07' });
    propsSchema = omitProps !== undefined && omitProps.length > 0 ? stripProps(js, omitProps) : js;
  }
  return { name, description: meta.description ?? '', ...(propsSchema === undefined ? {} : { propsSchema }) };
};

export const paletteFromRegistry = (
  registry: ComponentRegistry,
  options: PaletteFromRegistryOptions = {},
): LayoutPaletteEntry[] => {
  const names = options.include ?? registry.list();
  const out: LayoutPaletteEntry[] = [];
  for (const name of names) {
    const entry = registry.get(name);
    if (entry === undefined) continue;
    out.push(paletteEntryOf(name, entry.meta, options.omitProps));
  }
  return out;
};
