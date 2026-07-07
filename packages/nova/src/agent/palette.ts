import { z } from 'zod';
import type { ComponentRegistry } from '../layout/types';

// ───────────────────────────────────────────────────────────
// Derive a layout-agent palette from a ComponentRegistry.
//
// Reads each component's `meta.description` + `meta.propsSchema` straight off the
// registry and hands the agent a JSON Schema derived from the same Zod schema the
// renderer validates against — no drift. Component authors put what the agent
// needs on the source schema via `.describe()`; fixes go there, not here.
// ───────────────────────────────────────────────────────────

export type LayoutPaletteEntry = { name: string; description: string; propsSchema?: object };

export type PaletteFromRegistryOptions = {
  // Optional allowlist of component names. When omitted, every registered
  // component appears — pass a curated subset to keep the agent's vocabulary
  // tight (e.g. exclude shell slots / nav chrome).
  include?: readonly string[];
  // Prop names to strip from every component's schema. Use it to hide props the
  // agent must not set — e.g. presentational knobs (`bg`, `class`, `pad`) — so the
  // components can only render in their default style.
  omitProps?: readonly string[];
};

// Drop `omit` keys from a JSON Schema's `properties` (and `required`), so the
// agent never sees them.
const stripProps = (schema: object, omit: readonly string[]): object => {
  const s = schema as { properties?: Record<string, unknown>; required?: string[] };
  if (s.properties === undefined) return schema;
  const properties = { ...s.properties };
  for (const p of omit) delete properties[p];
  const required = s.required?.filter((r) => !omit.includes(r));
  return { ...s, properties, ...(required !== undefined ? { required } : {}) };
};

export const paletteFromRegistry = (
  registry: ComponentRegistry,
  options: PaletteFromRegistryOptions = {},
): LayoutPaletteEntry[] => {
  const names = options.include ?? registry.list();
  const omit = options.omitProps;
  const out: LayoutPaletteEntry[] = [];
  for (const name of names) {
    const entry = registry.get(name);
    if (entry === undefined) continue;
    let propsSchema: object | undefined;
    if (entry.meta.propsSchema !== undefined) {
      const js = z.toJSONSchema(entry.meta.propsSchema, { target: 'draft-7' });
      propsSchema = omit !== undefined && omit.length > 0 ? stripProps(js, omit) : js;
    }
    out.push({
      name,
      description: entry.meta.description ?? '',
      ...(propsSchema === undefined ? {} : { propsSchema }),
    });
  }
  return out;
};
