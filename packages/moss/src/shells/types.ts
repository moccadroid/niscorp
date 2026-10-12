import type { RenderNode, Shell } from '@niscorp/nova';

export type ShellConnection = {
  send: (text: string) => void;
  close: (code?: number, reason?: string) => void;
  seal?: (token: string) => Promise<string>;
};

export type ShellSession = {
  readonly shell: Shell;
  attach: (connection: ShellConnection, options?: { delta?: boolean }) => void;
  detach: (connection: ShellConnection) => void;
  resync: (connection: ShellConnection) => void;
  dispatch: (canvas: string, event: Record<string, unknown>) => void;
  publish: (channel: string, payload?: unknown) => void;
  back: () => boolean;
  popTo: (canvas: string, instance: string) => void;
  reset: () => void;
};

export type ShellReport = {
  principal: string;
  connections: number;
  since: number;
  idleSince: number | null;
  canvases: { id: string; actions: readonly string[] }[];
};

export type ShellSnapshot = {
  frame: RenderNode[];
  trees: Record<string, RenderNode[]>;
  seed?: string;
  settled: boolean;
  live: boolean;
  why: string[];
  drawnWith: string[];
};

export type ShellOpening = {
  seed?: string;
  inputs?: Record<string, Record<string, unknown>>;
};

export type ShellHost = {
  session: (token: string | null, principal: string | null, options?: ShellOpening) => Promise<ShellSession>;
  snapshot: (token: string | null, principal: string | null, options?: { waitMs?: number; inputs?: ShellOpening['inputs'] }) => Promise<ShellSnapshot>;
  deliver: (principal: string, channel: string, payload?: unknown) => boolean;
  list: () => ShellReport[];
  reset: (principal: string) => boolean;
};

export type OwnedShellHost = {
  host: ShellHost;
  adopt: () => void;
  stop: () => void;
};
