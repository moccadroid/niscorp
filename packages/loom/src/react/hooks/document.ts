import { createContext, useContext } from 'react';

export type LoomDocument = Record<string, unknown> | undefined;

export const LoomDocumentContext = createContext<LoomDocument>(undefined);

export const useLoomDocument = (): LoomDocument => useContext(LoomDocumentContext);
