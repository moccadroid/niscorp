import type { ScreenHead } from '@niscorp/nova/document';
import type { DocumentConfig } from './config';
import { renderDocument } from './document';

export type ExportedDocument = {
  path: string;
  html: string;
  page?: string;
  head?: ScreenHead;
  drawn: boolean;
  live: boolean;
  why: string[];
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
      // A page that could not be drawn is not taken to be finished.
      live: page.live ?? true,
      why: page.why ?? (page.drawn ? [] : ['the page could not be drawn']),
      drawnWith: page.drawnWith ?? [],
      settled: page.settled ?? false,
    });
  }
  return out;
};
