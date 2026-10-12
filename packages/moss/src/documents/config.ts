import type { ScreenHead } from '@niscorp/nova/document';
import type { ShellHost, ShellSnapshot } from '../shells';

export type DocumentHost = Pick<ShellHost, 'snapshot'>;

export type DocumentSource = {
  principalOf: (token: string) => Promise<string | null>;
  page: (path: string) => { name: string; host: DocumentHost; inputs: Record<string, Record<string, unknown>> } | undefined;
  shells?: DocumentHost;
};

export type DocumentConfig = {
  server: DocumentSource;
  template: string;
  // `host` is the Host header: without it a page on a port is drawn for nobody.
  request: { path: string; cookie?: string | null; host?: string | null };
  draw: (snapshot: ShellSnapshot) => string | Promise<string>;
  htmlAttributes?: (snapshot: ShellSnapshot) => Record<string, string>;
  site?: string;
  tokenKey?: string;
  waitMs?: number;
  // The empty element the screen goes into, as HTML exactly as the template has it.
  root?: string;
};

export type DrawnDocument = {
  html: string;
  headers: Record<string, string>;
  drawn: boolean;
  principal: string | null;
  page?: string;
  head?: ScreenHead;
  live?: boolean;
  why?: string[];
  drawnWith?: string[];
  settled?: boolean;
};
