import { LayoutNodeSchema, auditAction } from '@niscorp/nova';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { isRecord } from '@niscorp/nova/reflect';
import { depthRefusal, exceedsDepth } from '@niscorp/strata';
import type { Upgrader } from '@niscorp/strata';
import { z } from 'zod';
import { layoutMisfits, layoutNameRefusal } from '../manifest';
import type { KitComponents } from '../manifest';
import type { SavedVersion } from './saves';

// `use` marks the one of somebody's own layouts for a ref that is in use.
const SavedLayoutSchema = z.strictObject({ ref: z.string(), layout: LayoutNodeSchema, use: z.boolean().optional() });

export type SavedLayout = z.infer<typeof SavedLayoutSchema>;

export const upgradedLayoutBody = (upgrader: Upgrader, body: unknown, stamp: Readonly<Record<string, number>>): unknown =>
  isRecord(body) && body['layout'] !== undefined ? { ...body, layout: upgrader.upgrade(body['layout'], { kind: 'nisc.nova/layout', stamp }).document } : body;

export type LayoutHeldTo = {
  // The action whose layout the store of whoever the layout is for keeps under
  // this ref, with that layout in place.
  actionAt: (ref: string) => ActionDefinition | undefined;
  // The names the app's own shell keeps its own layouts under (the frame's and
  // each canvas's), and what a layout saved for one is held to. Absent in a
  // page's shell: a page draws the layouts it declares.
  ownShell?: { refs: ReadonlySet<string>; kit: KitComponents };
  kit: KitComponents;
};

const nothingKeptUnder = (ref: string): string =>
  `nothing is kept under "${ref}". A saved layout takes the place of the layout of an action its holder has, under "action/<the action’s id>", ` +
  'or of one the app’s own shell declares: its own under "frame", a canvas’s under "canvas/<the canvas’s id>".';

// What a layout saved under this ref takes the place of: an action's layout, or one of the app's own shell.
const targetAt = (ref: string, heldTo: LayoutHeldTo): { kit: KitComponents; action?: ActionDefinition } | undefined => {
  if (heldTo.ownShell?.refs.has(ref) === true) return { kit: heldTo.ownShell.kit };
  const action = heldTo.actionAt(ref);
  return action === undefined ? undefined : { kit: heldTo.kit, action };
};

export type InUseFor = {
  // Whose the layouts are, as a line says it of one that is left out: "of ada".
  whose: string;
  heldTo: LayoutHeldTo;
  say?: (line: string) => void;
};

export const refOf = (body: unknown): string | undefined => {
  const ref = isRecord(body) ? body['ref'] : undefined;
  return typeof ref === 'string' ? ref : undefined;
};

export const readLayout = (body: unknown, heldTo: LayoutHeldTo): { layout: SavedLayout } | { refusal: string } => {
  // First: the schema recurses, and a deep enough body overflows the stack.
  if (exceedsDepth(body)) return { refusal: depthRefusal() };
  const parsed = SavedLayoutSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { refusal: first === undefined ? 'no reason given' : `${first.path.join('.') || '(the body)'}: ${first.message}` };
  }
  const { ref, layout } = parsed.data;
  const target = targetAt(ref, heldTo);
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
// its action left, or its holder has it no longer.
const loaded = (version: SavedVersion, { whose, heldTo, say }: InUseFor): SavedLayout | undefined => {
  const ref = refOf(version.body);
  if (ref === undefined || targetAt(ref, heldTo) === undefined) return undefined;
  const read = version.unread !== undefined ? { refusal: version.unread } : readLayout(version.body, heldTo);
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
    const held = marked.get(ref);
    if (held === undefined || isLater(version, held)) marked.set(ref, version);
  }
  const layouts: Record<string, LayoutNode> = {};
  for (const version of marked.values()) {
    const read = loaded(version, drawnFor);
    if (read !== undefined) layouts[read.ref] = read.layout;
  }
  return layouts;
};
