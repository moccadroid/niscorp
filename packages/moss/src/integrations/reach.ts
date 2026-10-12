import type { Bundle } from './intake';

const normalizeReach = (path: string): string => (path.split('?')[0] ?? '').replace(/\/+$/, '');

// A declared endpoint's path, to the ids of the actions that declare it.
export type Reach = Record<string, string[]>;

export const reachOf = (bundle: Bundle, integrationId: string): Reach => {
  const own = `/integrations/${integrationId}/`;
  const reach: Reach = {};
  const admit = (url: string, actionId: string): void => {
    if (!url.startsWith(own)) return;
    const key = normalizeReach(url);
    const held = (reach[key] ??= []);
    if (!held.includes(actionId)) held.push(actionId);
  };
  for (const [actionId, action] of Object.entries(bundle.actions)) {
    for (const endpoint of Object.values(action.endpoints ?? {})) {
      admit('url' in endpoint ? endpoint.url : '', actionId);
    }
  }
  return Object.fromEntries(Object.entries(reach).sort(([a], [b]) => a.localeCompare(b)));
};

export const reachAdmits = (reach: Reach, path: string, held: ReadonlySet<string>): boolean =>
  (reach[normalizeReach(path)] ?? []).some((actionId) => held.has(actionId));

export const reachDeclares = (reach: Reach, path: string): boolean => reach[normalizeReach(path)] !== undefined;
