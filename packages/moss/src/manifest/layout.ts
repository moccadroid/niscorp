import { z } from 'zod';
import { isBinding } from '@niscorp/nova/i18n';
import { isRecord, walkNodes } from '@niscorp/nova/reflect';

// ═══════════════════════════════════════════════════════════════
// DOES A LAYOUT COMPOSE WHAT THE KIT HAS — the component names it uses, and
// the props it sets on each.
//
// The name is the floor: a component the terminal cannot render shows nothing,
// and at the moment somebody opens the screen rather than the moment it
// arrived. When the app carried a props schema for the component, the props
// are checked too: an unknown prop is the failure that installs cleanly and
// does nothing under a customer's finger, and a strict schema is exactly what
// refuses it.
//
// It is asked of a layout somebody else wrote, before it is let in (an
// integration's bundle). Only authored layouts are asked: a served or
// flattened tree is never held to an authoring schema.
// ═══════════════════════════════════════════════════════════════

// What the kit said of one component: the schema of its props, when the app
// carried one. A component with none is checked by its name alone.
export type KitComponents = ReadonlyMap<string, { propsSchema?: unknown }>;

// A prop VALUE that resolves at RENDER time, so nobody can know its type
// before: a binding string (`$.x`, `{{ }}`, `@scope` — nova's own isBinding),
// or a directive object (`$if`, `$eq`, `$prism` — a record carrying a
// `$`-prefixed key). Its KEY is still checked; only the value is skipped.
// Top-level by design — a binding buried inside an otherwise-static object
// value is not unwound.
const isDeferred = (value: unknown): boolean =>
  (typeof value === 'string' && isBinding(value)) || (isRecord(value) && Object.keys(value).some((key) => key.startsWith('$')));

// Each place a layout does not fit the kit, as a sentence, once: a component
// the app has none for, a prop the component has no place for, a value its
// schema refuses. Empty: the layout composes what the kit has.
export const layoutMisfits = (layout: unknown, components: KitComponents): string[] => {
  const found = new Set<string>();
  walkNodes(layout, (record) => {
    const name = record['component'];
    if (typeof name !== 'string') return;
    const spec = components.get(name);
    if (spec === undefined) {
      found.add(`layout uses "${name}", which this app has no component for`);
      return;
    }
    const schema = spec.propsSchema;
    const props = record['props'];
    if (!(schema instanceof z.ZodObject) || !isRecord(props)) return; // name-only
    const shape: Readonly<Record<string, z.core.$ZodType>> = schema.shape;
    for (const [key, value] of Object.entries(props)) {
      const prop = shape[key];
      if (prop === undefined) {
        found.add(`"${name}" has no prop "${key}"`);
        continue;
      }
      if (isDeferred(value)) continue;
      const check = z.safeParse(prop, value);
      if (!check.success) found.add(`"${name}" prop "${key}" — ${check.error.issues[0]?.message ?? 'invalid'}`);
    }
  });
  return [...found];
};
