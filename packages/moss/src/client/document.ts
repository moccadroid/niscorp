import { DocumentSnapshotSchema, SNAPSHOT_ELEMENT_ID } from '../protocol';
import type { DocumentSnapshot } from '../protocol';

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
