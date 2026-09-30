import type { ShellManifest } from '@niscorp/moss';

type Seeds = Awaited<ReturnType<NonNullable<ShellManifest['seeds']>>>;
import { ACTIONS } from '@lyceum/app/action-catalog';
import { CANVASES } from '@lyceum/app/shell/canvases';

// THE PHONE'S TABS, composed rather than listed (AGENTS.md, "a composed
// surface is rows, not a layout"). The `tabs` canvas is a list; what goes on it
// is every action this person is granted that can render as a tab — read off
// its own contract, a `tab` key in its `input` (shared/tab.layouts.ts). So a
// tab-able action the speaker gives on stage (the X-ray, a grant row) is on
// the bar the moment the grant is, and nothing lists it anywhere. The bar's
// order is the catalog's. The tab of what the body opens on starts marked.
const tabbable = (id: string): boolean => {
  const input = ACTIONS[id]?.input;
  const properties = typeof input === 'object' && input !== null ? Reflect.get(input, 'properties') : undefined;
  return typeof properties === 'object' && properties !== null && 'tab' in properties;
};

const bodyOpensOn = (granted: ReadonlySet<string>): string | undefined => {
  const initial = CANVASES.find((canvas) => canvas.id === 'body')?.initial;
  const candidates = initial === undefined ? [] : Array.isArray(initial) ? initial : [initial];
  return candidates.map((seed) => (typeof seed === 'string' ? seed : seed.action)).find((id) => granted.has(id));
};

export const lyceumSeeds: NonNullable<ShellManifest['seeds']> = ({ actions }): Seeds => {
  // The bar is the phone's; nobody without the phone has one.
  if (!actions.includes('member.phone')) return {};
  const granted = new Set(actions);
  const opens = bodyOpensOn(granted);
  return {
    tabs: Object.keys(ACTIONS)
      .filter((id) => granted.has(id) && tabbable(id))
      .map((id) => ({ action: id, input: id === opens ? { tab: true, tabInk: 'ink' } : { tab: true } })),
  };
};
