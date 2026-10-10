import type { WireStatus } from '../client';

// ═══════════════════════════════════════════════════════════════
// The connection's status, as a target shows it. A screen on a dead socket is
// indistinguishable from a working terminal rendering an empty app, so every
// target says which it is.
// ═══════════════════════════════════════════════════════════════

// A target that draws into an element says the status ON that element, as
// `data-wire-status`, and draws nothing for it: what a lost connection looks
// like is the kit's stylesheet's (`[data-wire-status='closed'] { … }`). Said
// when the target mounts and on every update, and taken off when it is
// destroyed.
const STATUS_ATTRIBUTE = 'data-wire-status';
export const showStatus = (root: HTMLElement, status: WireStatus): void => root.setAttribute(STATUS_ATTRIBUTE, status);
export const hideStatus = (root: HTMLElement): void => root.removeAttribute(STATUS_ATTRIBUTE);

// What a target that prints words says (./tty as each change happens, ./ink
// for as long as it is not open).
export const STATUS_WORDS = {
  connecting: '… connecting',
  connected: '✓ connected',
  lost: '× connection lost — retrying',
  incompatible: '× this terminal and the server speak different protocol versions — update one of them',
} as const;
