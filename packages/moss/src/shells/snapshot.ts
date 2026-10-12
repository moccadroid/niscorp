import { livenessOf } from '@niscorp/nova/reflect';
import { shellSettled } from '@niscorp/nova';
import type { ActionDefinition, RenderNode } from '@niscorp/nova';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { canvasesOf, withLayoutInPlace } from './host-state';
import type { Live } from './host-state';
import { treeOf } from './stream';
import type { ShellSnapshot } from './types';

export type ShellNeed = {
  live: boolean;
  why: string[];
  drawnWith: string[];
};

const fingerprintOf = (request: unknown): string | undefined => {
  if (request === null || typeof request !== 'object' || Array.isArray(request)) return undefined;
  const fingerprint: unknown = Reflect.get(request, 'fingerprint');
  return typeof fingerprint === 'string' ? fingerprint : undefined;
};

export const shellNeedOf = (definition: ActionDefinition, entries: ReadonlyMap<string, SeedEntry | SeedMutation>): ShellNeed => {
  const facts = livenessOf(definition);
  const why: string[] = [];
  const drawnWith: string[] = [];

  if (facts.gestures) why.push('a person can act on it');
  if (facts.opaqueLayout) why.push('its layout is the name of a stored layout, so what can be pressed on it is not readable');
  for (const channel of facts.listens) why.push(`it waits on the channel "${channel}"`);

  for (const use of facts.endpoints) {
    if (!use.onOpen && !use.later) continue;
    if (use.kind === 'fn') {
      why.push(`it calls the function endpoint "${use.name}", which is code`);
      continue;
    }
    const fingerprint = fingerprintOf(use.request);
    const entry = fingerprint === undefined ? undefined : entries.get(fingerprint);
    if (entry !== undefined && !('mutation' in entry) && entry.refresh === 'reactive') {
      why.push(`its read "${use.name}" keeps answering (${entry.fingerprint} is reactive)`);
      continue;
    }
    if (fingerprint !== undefined && entry === undefined) {
      why.push(`its read "${use.name}" replays "${fingerprint}", which the manifest does not carry — whether it keeps answering is not readable`);
      continue;
    }
    // An endpoint called only later adds no reason: the gesture or the channel
    // that calls it is already one.
    if (use.onOpen) drawnWith.push(fingerprint ?? use.url ?? use.name);
  }

  return { live: why.length > 0, why, drawnWith };
};

export const DEFAULT_SNAPSHOT_WAIT_MS = 300;

export const settle = async (live: Live, waitMs: number): Promise<boolean> => {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), waitMs);
  });
  const whole = live.seeded.then(() => shellSettled(live.shell, { waitMs: Math.max(0, waitMs - (Date.now() - started)), stopped: () => live.ended }));
  const settled = await Promise.race([whole, deadline]);
  clearTimeout(timer);
  return settled;
};

export const read = (live: Live): Pick<ShellSnapshot, 'frame' | 'trees'> => {
  let frameTree: RenderNode[] = [];
  try {
    frameTree = live.shell.getShellRenderTree();
  } catch (error) {
    console.error('[moss/shells] the shell frame failed to render for a snapshot — serving an empty arrangement:', error);
  }
  const trees: Record<string, RenderNode[]> = {};
  for (const canvasId of canvasesOf(live)) {
    try {
      trees[canvasId] = treeOf(live, canvasId);
    } catch (error) {
      console.error(`[moss/shells] canvas "${canvasId}" failed to render for a snapshot — leaving it out:`, error);
    }
  }
  return { frame: frameTree, trees };
};

export const needOf = (live: Live, principal: string | null, kept: boolean): Pick<ShellSnapshot, 'live' | 'why' | 'drawnWith'> => {
  const why: string[] = [];
  const drawnWith: string[] = [];
  const { entries } = live;
  if (entries === undefined) return { live: true, why: ['this host was given no way to ask what its actions need'], drawnWith };
  if (kept && principal !== null) why.push('the app’s shell is kept for whoever is signed in');
  for (const canvas of Object.values(live.shell.getState().canvases)) {
    for (const instance of canvas.stack) {
      // Read off the instance, not the composition: one pushed `with` fragments
      // runs the composed definition, and a fragment adds what can be pressed.
      // With its layout in place: nova reads what can be pressed off the layout
      // itself, and does not look behind a ref.
      const definition = live.shell.getRuntime(instance.id)?.definition;
      if (definition === undefined) continue;
      const need = shellNeedOf(withLayoutInPlace(definition, live.shell.layoutStore), entries);
      for (const reason of need.why) why.push(`${definition.id}: ${reason}`);
      for (const read of need.drawnWith) drawnWith.push(read);
    }
  }
  return { live: why.length > 0, why, drawnWith };
};
