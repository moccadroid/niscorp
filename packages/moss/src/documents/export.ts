import type { ScreenHead } from '@niscorp/nova/document';
import type { DocumentConfig } from './config';
import { renderDocument } from './document';

// ── pages, as files ──
//
// The same draw, for NOBODY, once per path: what a static host serves. There is
// no credential to pass and no way to pass one — a file is the page as nobody
// in particular sees it, which is the only page that may be kept.
//
// A page that is LIVE is still written, and said so: its file is a true first
// screen, and its terminal will look for a socket. Whether that is acceptable
// (a server stands beside the files) or a mistake (there is no server) is the
// build's to decide, from the report — nothing here guesses.

export type ExportedDocument = {
  path: string;
  html: string;
  page?: string;
  head?: ScreenHead;
  drawn: boolean;
  live: boolean;
  why: string[];
  // reads whose answers are in the file as they were when it was written
  drawnWith: string[];
  settled: boolean;
};

export const exportDocuments = async (config: Omit<DocumentConfig, 'request'> & { paths: readonly string[] }): Promise<ExportedDocument[]> => {
  const { paths, ...rest } = config;
  const out: ExportedDocument[] = [];
  for (const path of paths) {
    const page = await renderDocument({ ...rest, request: { path, cookie: null } });
    out.push({
      path,
      html: page.html,
      ...(page.page !== undefined ? { page: page.page } : {}),
      ...(page.head !== undefined ? { head: page.head } : {}),
      drawn: page.drawn,
      // undrawn is not concluded finished
      live: page.live ?? true,
      why: page.why ?? (page.drawn ? [] : ['the page could not be drawn']),
      drawnWith: page.drawnWith ?? [],
      settled: page.settled ?? false,
    });
  }
  return out;
};
