import type { WireStatus } from '../client';

const STATUS_ATTRIBUTE = 'data-wire-status';
export const showStatus = (root: HTMLElement, status: WireStatus): void => root.setAttribute(STATUS_ATTRIBUTE, status);
export const hideStatus = (root: HTMLElement): void => root.removeAttribute(STATUS_ATTRIBUTE);

export const STATUS_WORDS = {
  connecting: '… connecting',
  connected: '✓ connected',
  lost: '× connection lost — retrying',
  incompatible: '× this terminal and the server speak different protocol versions — update one of them',
} as const;
