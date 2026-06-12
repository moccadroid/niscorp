import { getPath } from '@niscorp/nova';
import { useLoomDocument } from '@react/hooks/document';
import type { Catalog } from '../widgets.js';

// The columns narrowed to the entities in the query's `from`, read from the live
// document (`{ query: … }`, so the path is `query.from`). Returns the full list
// when `from` is empty or names no known entity, so the pickers always offer
// something.
export const useScopedColumns = (catalog: Catalog): string[] => {
  const document = useLoomDocument();
  const from = document === undefined ? undefined : getPath(document, 'query.from');
  const entities = Array.isArray(from) ? from.filter((source): source is string => typeof source === 'string') : [];
  if (entities.length === 0) return catalog.columns;
  const allowed = new Set(entities);
  const scoped = catalog.columns.filter((column) => allowed.has(column.slice(0, column.indexOf('.'))));
  return scoped.length > 0 ? scoped : catalog.columns;
};
