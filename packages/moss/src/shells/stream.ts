import { canvasTreeOf } from '@niscorp/nova';
import type { RenderNode } from '@niscorp/nova';
import { encodeDelta, frameHash } from '../protocol';
import type { ServerMessage } from '../protocol';
import { canvasesOf } from './host-state';
import type { Live } from './host-state';
import type { ShellConnection } from './types';

// ═══════════════════════════════════════════════════════════════
// THE STREAM — a shell's canvases and its frame, rendered into messages and
// sent to whatever is attached.
//
// It is part of "what somebody is looking at", and not of the socket, because
// of what it keeps: the last frame sent for each canvas (`sent`) is held PER
// SHELL and shared by every connection of that shell. A newcomer is levelled
// with it on attach, a change is compared against it once and fanned out to
// all of them, and a delta is encoded once for the whole set. A connection
// holds none of this: it is a place to send to.
// ═══════════════════════════════════════════════════════════════

// No visible content = empty tree over the wire, so a terminal collapses chrome
// on `length` alone. The rule is nova's (`canvasTreeOf`): a canvas is handed to
// an adapter the same way whether it is served from here or lives beside it.

// Flatten, then serialize. No language step here any more: the shell was
// built with its book, and nova applies it where a RenderNode is minted, so
// what comes out of `getCanvasRenderTree` is already in the reader's
// language. Everything downstream — the delta encoder, the socket, the
// terminal — is handed a finished frame and never learns a language was
// involved, exactly as before; there is simply one fewer walk to get there.
export const treeOf = (live: Live, canvasId: string): RenderNode[] => canvasTreeOf(live.shell, canvasId);

const frame = (live: Live, canvasId: string): string => {
  const message: ServerMessage = { type: 'render', canvas: canvasId, tree: treeOf(live, canvasId) };
  return JSON.stringify(message);
};

// A canvas whose tree throws while rendering must not take the session with
// it. Unguarded, one bad tree killed the entire flush pass: every canvas
// after it never rendered, the throw escaped a microtask with nobody to
// catch it, and — because `sent` was never updated for the canvas that threw
// — every later pass hit the same node again. That is a shell wedged for the
// life of the process, and no reconnect could clear it, since reattaching a
// durable shell finds the same wreck. Now the failing canvas holds its last
// good tree, its neighbours keep rendering, and `reset` is the way out.
export const frameOf = (live: Live, canvasId: string): string | null => {
  try {
    return frame(live, canvasId);
  } catch (error) {
    console.error(`[moss/shells] canvas "${canvasId}" failed to render — holding its last tree:`, error);
    return null;
  }
};

// A delta is only worth sending when it is DECISIVELY smaller. The transport
// compresses whatever it is handed, and a delta that saves 20% of the bytes
// saves nothing once both go through deflate — while still costing the
// terminal a rebuild and a checksum. Measured on Lyra: an in-place update
// (keystroke, one row's badge) lands at 1–4% and is far under this; a
// navigation lands near 80% and is deliberately left whole.
const DELTA_CEILING = 0.6;

// And only between frames small enough to be worth comparing. The encode's
// cost follows the size of the frames, not of the change, and it is paid on
// the thread every session shares: about 7 ms for an in-place change at
// 64 KB, a second at 2.7 MB, and at 20 MB eight seconds and a gigabyte to
// fail and send the frame whole anyway. Past this length — of the frame the
// connections hold, or of the one replacing it — the answer is "whole"
// before anything is spent on finding out.
const DELTA_MAX_FRAME = 64 * 1024;

// The delta message, or null to send the frame whole. Never throws: a frame
// failing to encode is a reason to fall back, not a reason to lose the frame.
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

// One pass over a shell: re-render, and send what changed to every attached
// connection.
const pass = (live: Live, delta: boolean): void => {
  if (live.ended) return;
  const canvases = canvasesOf(live);
  // A canvas the shell no longer has. Every terminal holds a tree for it, so
  // it is sent empty, once, and what was last sent for it is forgotten.
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
    // Encoded ONCE for the whole set: every connection holds `sent`, so
    // they share a baseline and therefore a delta.
    const short = delta && previous !== undefined && live.deltaReady.size > 0 ? shorterAsDelta(previous, next, canvasId) : null;
    for (const connection of live.connections) {
      connection.send(short !== null && live.deltaReady.has(connection) ? short : next);
    }
  }
  // THE FRAME too — re-rendered and diffed like a canvas, so a `setLayout`
  // (or `setCanvasLayout`) that changes the arrangement reaches every
  // attached terminal, not only the next one to attach. Sent AFTER the
  // canvases, so a frame that references a canvas seeded this same pass finds
  // its tree already delivered. Guarded like attach: a frame that fails to
  // render leaves the last one standing rather than taking the pass down.
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

// Any state or data change → re-render, send what changed, to every
// attached connection. Microtask-coalesced, with one trailing pass a
// tick later: some transitions (instance status settling after its
// loads) land AFTER the last notification, and the trailing pass
// catches the settled tree.
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

// (Re)attach: the frame first — the canvas arrangement, CanvasSlot markers
// the terminal resolves — then every canvas's current tree, no replay
// machinery. Both are guarded, because the one moment a terminal MOST needs
// to be served is when the shell it is attaching to is the broken one: a
// throw here would leave the connection open with nothing on it, which is
// the failure that has no diagnosis.
//
// `wantsDelta`: this connection may be sent deltas (it asked, and the host
// sends them).
export const attach = (live: Live, connection: ShellConnection, wantsDelta: boolean): void => {
  live.connections.add(connection);
  if (wantsDelta) live.deltaReady.add(connection);
  live.idleSince = null;
  let frameTree: RenderNode[] | undefined;
  try {
    // The arrangement carries words too — a canvas's own chrome, a Sheet's
    // title — and gets them from the same place: the shell it was rendered by.
    frameTree = live.shell.getShellRenderTree();
  } catch (error) {
    console.error('[moss/shells] the shell frame failed to render — serving an empty arrangement:', error);
  }
  const frameMessage = JSON.stringify({ type: 'frame', tree: frameTree ?? [] } satisfies ServerMessage);
  connection.send(frameMessage);
  if (frameTree === undefined) {
    // What the newcomer was served is not the frame: nobody is level with
    // anything, so the next one that renders goes to everybody.
    delete live.sentFrame;
  } else {
    // The newcomer joins the frame's shared baseline the same way it joins
    // each canvas's below, and for the same reason the others are sent it
    // when it moved: attaching RENDERS, and can pick up a change the flush
    // has not sent yet. The baseline then moved to a frame only the newcomer
    // held, and the flush, finding nothing changed, sent it to nobody else.
    if (live.sentFrame !== frameMessage) {
      for (const other of live.connections) if (other !== connection) other.send(frameMessage);
    }
    live.sentFrame = frameMessage;
  }
  for (const canvasId of canvasesOf(live)) {
    const next = frameOf(live, canvasId);
    if (next === null) continue;
    // Attaching RENDERS, and rendering can pick up a change the flush pass
    // has not sent yet — `sent` would then move to a frame only the newcomer
    // holds, and the next pass would skip it as unchanged, leaving everyone
    // else stale. So the newcomer's frame is the whole room's frame. Deltas
    // depend on this being true: one baseline, or the encode is a lie.
    if (live.sent.get(canvasId) !== next) {
      for (const other of live.connections) if (other !== connection) other.send(next);
    }
    live.sent.set(canvasId, next);
    connection.send(next);
  }
};

// Whole frames for this one connection — the state both ends can always
// agree on. It stays delta-capable: it is level with `sent` again the
// moment this returns, and the checksum will catch it if it is not.
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
