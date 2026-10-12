import { canvasTreeOf } from '@niscorp/nova';
import type { RenderNode } from '@niscorp/nova';
import { encodeDelta, frameHash } from '../protocol';
import type { ServerMessage } from '../protocol';
import { canvasesOf } from './host-state';
import type { Live } from './host-state';
import type { ShellConnection } from './types';

export const treeOf = (live: Live, canvasId: string): RenderNode[] => canvasTreeOf(live.shell, canvasId);

const frame = (live: Live, canvasId: string): string => {
  const message: ServerMessage = { type: 'render', canvas: canvasId, tree: treeOf(live, canvasId) };
  return JSON.stringify(message);
};

export const frameOf = (live: Live, canvasId: string): string | null => {
  try {
    return frame(live, canvasId);
  } catch (error) {
    console.error(`[moss/shells] canvas "${canvasId}" failed to render — holding its last tree:`, error);
    return null;
  }
};

// A delta has to be decisively smaller: the transport compresses both, and a
// delta still costs the terminal a rebuild and a checksum.
const DELTA_CEILING = 0.6;

// The encode costs by the size of the frames, not of the change, on the thread
// every session shares: a longer frame goes whole.
const DELTA_MAX_FRAME = 64 * 1024;

const shorterAsDelta = (previous: string, next: string, canvasId: string): string | null => {
  if (previous.length > DELTA_MAX_FRAME || next.length > DELTA_MAX_FRAME) return null;
  try {
    const ops = encodeDelta(previous, next);
    const message: ServerMessage = { type: 'render-delta', canvas: canvasId, ops, hash: frameHash(next) };
    const text = JSON.stringify(message);
    return text.length <= next.length * DELTA_CEILING ? text : null;
  } catch (error) {
    console.error(`[moss/shells] canvas "${canvasId}" failed to encode as a delta — sending it whole:`, error);
    return null;
  }
};

const pass = (live: Live, delta: boolean): void => {
  if (live.ended) return;
  const canvases = canvasesOf(live);
  for (const gone of [...live.sent.keys()].filter((canvasId) => !canvases.includes(canvasId))) {
    live.sent.delete(gone);
    const empty = JSON.stringify({ type: 'render', canvas: gone, tree: [] } satisfies ServerMessage);
    for (const connection of live.connections) connection.send(empty);
  }
  for (const canvasId of canvases) {
    const next = frameOf(live, canvasId);
    const previous = live.sent.get(canvasId);
    if (next === null || previous === next) continue;
    live.sent.set(canvasId, next);
    const short = delta && previous !== undefined && live.deltaReady.size > 0 ? shorterAsDelta(previous, next, canvasId) : null;
    for (const connection of live.connections) {
      connection.send(short !== null && live.deltaReady.has(connection) ? short : next);
    }
  }
  // The frame goes after the canvases, so one that references a canvas rendered
  // in this pass finds its tree already delivered.
  let frame: string | undefined;
  try {
    frame = JSON.stringify({ type: 'frame', tree: live.shell.getShellRenderTree() } satisfies ServerMessage);
  } catch (error) {
    console.error('[moss/shells] the shell frame failed to render on a flush — leaving the last one in place:', error);
  }
  if (frame !== undefined && frame !== live.sentFrame) {
    live.sentFrame = frame;
    for (const connection of live.connections) connection.send(frame);
  }
};

// The second pass, a tick later, catches what settles after the last
// notification (an instance's status, once its loads are in).
export const follow = (live: Live, delta: boolean): void => {
  const flush = (): void => {
    if (live.flushing) return;
    live.flushing = true;
    queueMicrotask(() => {
      live.flushing = false;
      pass(live, delta);
      setTimeout(() => pass(live, delta), 0);
    });
  };
  live.shell.onStateChange(flush);
  live.shell.onDataChange(flush);
};

export const attach = (live: Live, connection: ShellConnection, wantsDelta: boolean): void => {
  live.connections.add(connection);
  if (wantsDelta) live.deltaReady.add(connection);
  live.idleSince = null;
  let frameTree: RenderNode[] | undefined;
  try {
    frameTree = live.shell.getShellRenderTree();
  } catch (error) {
    console.error('[moss/shells] the shell frame failed to render — serving an empty arrangement:', error);
  }
  const frameMessage = JSON.stringify({ type: 'frame', tree: frameTree ?? [] } satisfies ServerMessage);
  connection.send(frameMessage);
  if (frameTree === undefined) {
    delete live.sentFrame;
  } else {
    // Attaching renders, and can pick up a change no pass has sent yet. The
    // baseline then moves, so the others are sent it too: a pass would find
    // nothing changed. The canvases below do the same, and a delta relies on it.
    if (live.sentFrame !== frameMessage) {
      for (const other of live.connections) if (other !== connection) other.send(frameMessage);
    }
    live.sentFrame = frameMessage;
  }
  for (const canvasId of canvasesOf(live)) {
    const next = frameOf(live, canvasId);
    if (next === null) continue;
    if (live.sent.get(canvasId) !== next) {
      for (const other of live.connections) if (other !== connection) other.send(next);
    }
    live.sent.set(canvasId, next);
    connection.send(next);
  }
};

// What `sent` holds, not a fresh render: the connection ends level with the
// baseline the others share, and stays delta-capable.
export const resync = (live: Live, connection: ShellConnection): void => {
  if (!live.connections.has(connection)) return;
  let frameTree: RenderNode[] = [];
  try {
    frameTree = live.shell.getShellRenderTree();
  } catch (error) {
    console.error('[moss/shells] the shell frame failed to render on resync — serving an empty arrangement:', error);
  }
  connection.send(JSON.stringify({ type: 'frame', tree: frameTree } satisfies ServerMessage));
  for (const canvasId of canvasesOf(live)) {
    const current = live.sent.get(canvasId) ?? frameOf(live, canvasId);
    if (current === null || current === undefined) continue;
    connection.send(current);
  }
};
