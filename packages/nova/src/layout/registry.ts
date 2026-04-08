import type {
  ComponentEntry,
  ComponentMeta,
  ComponentRegistry,
  RegistrationInput,
} from './types';

// ═══════════════════════════════════════════════════════════
// Component registry
//
// Stores `{component, meta}` entries keyed by name. Components
// can carry a static `.meta` property; `registerAll` picks it up
// automatically. Explicit meta passed to `register`/`registerAll`
// wins over a component's static meta.
// ═══════════════════════════════════════════════════════════

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const isComponentMeta = (value: unknown): value is ComponentMeta => {
  if (typeof value !== 'object' || value === null) return false;
  // Meta is an open bag with optional fields; any plain object qualifies.
  return true;
};

const extractStaticMeta = <TComponent>(component: TComponent): ComponentMeta | undefined => {
  if (typeof component !== 'function' && (typeof component !== 'object' || component === null)) {
    return undefined;
  }
  const host: object = component;
  if (!hasOwn(host, 'meta')) return undefined;
  const candidate = (host as { meta: unknown }).meta;
  if (!isComponentMeta(candidate)) return undefined;
  return candidate;
};

const isEntryShape = <TComponent>(
  value: RegistrationInput<TComponent>,
): value is { component: TComponent; meta?: ComponentMeta } => {
  if (typeof value !== 'object' || value === null) return false;
  return hasOwn(value, 'component');
};

export const createComponentRegistry = <TComponent = unknown>(): ComponentRegistry<TComponent> => {
  const entries = new Map<string, ComponentEntry<TComponent>>();

  const register = (name: string, component: TComponent, meta?: ComponentMeta): void => {
    const staticMeta = extractStaticMeta(component);
    const merged: ComponentMeta = { ...(staticMeta ?? {}), ...(meta ?? {}) };
    entries.set(name, { component, meta: merged });
  };

  const registerAll = (batch: Record<string, RegistrationInput<TComponent>>): void => {
    for (const name of Object.keys(batch)) {
      const input = batch[name];
      if (input === undefined) continue;
      if (isEntryShape<TComponent>(input)) {
        register(name, input.component, input.meta);
      } else {
        register(name, input);
      }
    }
  };

  const get = (name: string): ComponentEntry<TComponent> | undefined => entries.get(name);

  const has = (name: string): boolean => entries.has(name);

  const list = (): string[] => Array.from(entries.keys());

  return { register, registerAll, get, has, list };
};
