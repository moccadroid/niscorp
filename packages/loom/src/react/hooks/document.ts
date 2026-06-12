import { createContext, useContext } from 'react';

// The document the editor is currently editing, available to widgets. A widget
// gets its own field value as a prop; useLoomDocument gives it the whole
// document, for widgets that need other fields (e.g. a Vex field-path picker
// reading the query's `from`).

export type LoomDocument = Record<string, unknown> | undefined;

export const LoomDocumentContext = createContext<LoomDocument>(undefined);

export const useLoomDocument = (): LoomDocument => useContext(LoomDocumentContext);
