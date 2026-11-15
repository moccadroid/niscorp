import { LayoutNodeSchema, auditAction } from '@niscorp/nova';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { isRecord } from '@niscorp/nova/reflect';
import { depthRefusal, exceedsDepth } from '@niscorp/strata';
import type { Upgrader } from '@niscorp/strata';
import { z } from 'zod';
import { actionOfLayoutRef, layoutMisfits, layoutNameRefusal } from '../manifest';
import type { KitComponents } from '../manifest';
import type { SavedVersion } from './saves';

// `use` marks the one of somebody's own layouts for a ref that is in use.
const SavedLayoutSchema = z.strictObject({ ref: z.string(), layout: LayoutNodeSchema, use: z.boolean().optional() });

export type SavedLayout = z.infer<typeof SavedLayoutSchema>;

export const upgradedLayoutBody = (upgrader: Upgrader, body: unknown, stamp: Readonly<Record<string, number>>): unknown =>
  isRecord(body) && body['layout'] !== undefined ? { ...body, layout: upgrader.upgrade(body['layout'], { kind: 'nisc.nova/layout', stamp }).document } : body;

export const actionAtRef =
  (actions: Readonly<Record<string, ActionDefinition>>, layouts: Readonly<Record<string, LayoutNode>>) =>
  (ref: string): ActionDefinition | undefined => {
    const id = actionOfLayoutRef(ref);
    const action = id !== undefined && Object.hasOwn(actions, id) ? actions[id] : undefined;
    const layout = Object.hasOwn(layouts, ref) ? layouts[ref] : undefined;
    return action === undefined || layout === undefined ? undefined : { ...action, layout };
  };

export type LayoutChecks = {
  // The action whose layout the store of whoever the layout is for keeps under
  // this ref, with that layout in place.
  actionAt: (ref: string) => ActionDefinition | undefined;
  // The names the app's own shell keeps its own layouts under (the frame's and
  // each canvas's), and what a layout saved for one is checked against. Absent in a
  // page's shell: a page draws the layouts it declares.
  ownShell?: { refs: ReadonlySet<string>; kit: KitComponents };
  kit: KitComponents;
};

const nothingKeptUnder = (ref: string): string =>
  `nothing is kept under "${ref}". A saved layout takes the place of the layout of an action its holder has, under "action/<the action’s id>", ` +
  'or of one the app’s own shell declares: its own under "frame", a canvas’s under "canvas/<the canvas’s id>".';

// What a layout saved under this ref takes the place of: an action's layout, or one of the app's own shell.
const targetAt = (ref: string, checks: LayoutChecks): { kit: KitComponents; action?: ActionDefinition } | undefined => {
  if (checks.ownShell?.refs.has(ref) === true) return { kit: checks.ownShell.kit };
  const action = checks.actionAt(ref);
  return action === undefined ? undefined : { kit: checks.kit, action };
};

export type InUseFor = {
  // Whose the layouts are, as a line says it of one that is left out: "of ada".
  whose: string;
  checks: LayoutChecks;
  say?: (line: string) => void;
};

export const refOf = (body: unknown): string | undefined => {
  const ref = isRecord(body) ? body['ref'] : undefined;
  return typeof ref === 'string' ? ref : undefined;
};

export const readLayout = (body: unknown, checks: LayoutChecks): { layout: SavedLayout } | { refusal: string } => {
  // First: the schema recurses, and a deep enough body overflows the stack.
  if (exceedsDepth(body)) return { refusal: depthRefusal() };
  const parsed = SavedLayoutSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { refusal: first === undefined ? 'no reason given' : `${first.path.join('.') || '(the body)'}: ${first.message}` };
  }
  const { ref, layout } = parsed.data;
  const target = targetAt(ref, checks);
  if (target === undefined) return { refusal: nothingKeptUnder(ref) };
  const misfits = layoutMisfits(layout, target.kit);
  if (misfits.length > 0) return { refusal: misfits.join('; ') };
  const named = layoutNameRefusal(layout);
  if (named !== undefined) return { refusal: `it ${named}` };
  const { action } = target;
  if (action === undefined) return { layout: parsed.data };
  // What nova's audit finds of the action with this layout in place, and does
  // not find with the layout it takes the place of: the rest is not this layout's.
  const found = new Set(auditAction(action).issues);
  const added = auditAction({ ...action, layout }).issues.filter((issue) => !found.has(issue));
  if (added.length > 0) return { refusal: added.join('; ') };
  return { layout: parsed.data };
};

// A layout whose ref the store does not keep is not loaded, and nothing is said:
// its action left, or its owner has it no longer.
const loaded = (version: SavedVersion, { whose, checks, say }: InUseFor): SavedLayout | undefined => {
  const ref = refOf(version.body);
  if (ref === undefined || targetAt(ref, checks) === undefined) return undefined;
  const read = version.unread !== undefined ? { refusal: version.unread } : readLayout(version.body, checks);
  if ('layout' in read) return read.layout;
  (say ?? console.error)(`[moss] the layout "${version.id}" ${whose} is left out: ${read.refusal}`);
  return undefined;
};

export const isInUse = (version: SavedVersion): boolean => version.kind === 'layout' && isRecord(version.body) && version.body['use'] === true;

const isLater = (one: SavedVersion, other: SavedVersion): boolean => (one.createdAt === other.createdAt ? one.save > other.save : one.createdAt > other.createdAt);

// Of several marked in use for one ref the latest counts: two saves at once can
// each leave theirs marked, and the next save takes the mark off all but its own.
export const layoutsInUse = (inForce: readonly SavedVersion[], drawnFor: InUseFor): Readonly<Record<string, LayoutNode>> => {
  const marked = new Map<string, SavedVersion>();
  for (const version of inForce.filter(isInUse)) {
    const ref = refOf(version.body);
    if (ref === undefined) continue;
    const latest = marked.get(ref);
    if (latest === undefined || isLater(version, latest)) marked.set(ref, version);
  }
  const layouts: Record<string, LayoutNode> = {};
  for (const version of marked.values()) {
    const read = loaded(version, drawnFor);
    if (read !== undefined) layouts[read.ref] = read.layout;
  }
  return layouts;
};
