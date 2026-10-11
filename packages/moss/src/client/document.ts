import { DocumentSnapshotSchema, SNAPSHOT_ELEMENT_ID } from '../protocol';
import type { DocumentSnapshot } from '../protocol';

// What a server-rendered document carries beside its HTML: the screen it was
// drawn from, in an element whose id the protocol names. The server writes
// both and this reads them.

// Read the snapshot out of the page, if it has one. Never throws: a page
// without one, or with one that does not parse, is a page that was not
// server-rendered, and the terminal starts without a screen.
export const readDocumentSnapshot = (doc: Pick<Document, 'getElementById'> = document): DocumentSnapshot | undefined => {
  try {
    const text = doc.getElementById(SNAPSHOT_ELEMENT_ID)?.textContent;
    if (text === undefined || text === null || text === '') return undefined;
    const read = DocumentSnapshotSchema.safeParse(JSON.parse(text));
    return read.success ? read.data : undefined;
  } catch {
    return undefined;
  }
};
