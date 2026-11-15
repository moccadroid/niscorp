import type { Charter, RoleDef, Section, Selection } from './types';

const ROLE_KEYS: ReadonlySet<string> = new Set(['extends', 'without', 'allow', 'deny', 'actions', 'data', 'layouts', 'functions', 'scoping']);
const SELECTION_KEYS: ReadonlySet<string> = new Set(['allow', 'deny']);
const SECTIONS: readonly Section[] = ['actions', 'data', 'layouts', 'functions'];
const ROLE_LISTS = ['extends', 'without', 'allow', 'deny'] as const;

const unreadKey = (role: string, key: string): string => `role "${role}" has the key "${key}", which the charter does not read: what it lists does not apply`;

const stringAsList = (role: string, key: string, value: string): string => `role "${role}": "${key}" is the string "${value}", read as the list ${JSON.stringify([value])}`;

const selectionShape = (role: string, section: Section, selection: Selection | undefined): string[] => {
  if (typeof selection === 'string') {
    return [`role "${role}": "${section}" is the string "${selection}", which grants nothing: a section is a list of globs or { allow, deny }`];
  }
  if (typeof selection !== 'object' || Array.isArray(selection)) return [];
  return [
    ...Object.keys(selection).flatMap((key) => (SELECTION_KEYS.has(key) ? [] : [unreadKey(role, `${section}.${key}`)])),
    ...(['allow', 'deny'] as const).flatMap((key) => {
      const value = selection[key];
      return typeof value === 'string' ? [stringAsList(role, `${section}.${key}`, value)] : [];
    }),
  ];
};

const roleShape = (role: string, def: RoleDef): string[] => {
  if (typeof def === 'string') return [`role "${role}" is the string "${def}", which grants nothing: a role is a list of globs or an object`];
  if (typeof def !== 'object' || Array.isArray(def)) return [];
  return [
    ...Object.keys(def).flatMap((key) => (ROLE_KEYS.has(key) ? [] : [unreadKey(role, key)])),
    ...ROLE_LISTS.flatMap((key) => {
      const value = def[key];
      return typeof value === 'string' ? [stringAsList(role, key, value)] : [];
    }),
    ...SECTIONS.flatMap((section) => selectionShape(role, section, def[section])),
  ];
};

// The types say what a charter is; a charter read from JSON is whatever was written.
export const charterShape = (charter: Charter): string[] => Object.entries(charter).flatMap(([role, def]) => roleShape(role, def));
