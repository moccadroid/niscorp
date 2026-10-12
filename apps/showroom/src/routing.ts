import type { LibraryModule } from './modules/types';

export const START_ID = 'start';

const DOC_PREFIX = 'doc:';
export const docId = (id: string): string => `${DOC_PREFIX}${id}`;
export const isDocSelection = (id: string): boolean => id.startsWith(DOC_PREFIX);
export const stripDocPrefix = (id: string): string => id.slice(DOC_PREFIX.length);

const BASE = import.meta.env.BASE_URL;
const BASE_NO_SLASH = BASE.replace(/\/$/, '');

export const routeSegments = (): string[] => {
  let path = window.location.pathname;
  if (BASE_NO_SLASH !== '' && path.startsWith(BASE_NO_SLASH)) path = path.slice(BASE_NO_SLASH.length);
  return path.split('/').filter((segment) => segment.length > 0);
};

const join = (...segments: string[]): string => BASE + segments.join('/');

export const buildPath = (libraryId: string, selection: string, mod: LibraryModule | undefined): string => {
  if (libraryId === START_ID) return BASE;
  if (selection === '') return join(libraryId);
  if (isDocSelection(selection)) return join(libraryId, stripDocPrefix(selection));
  const story = mod?.stories.find((s) => s.id === selection);
  return story !== undefined ? join(libraryId, story.kind, story.id) : join(libraryId, selection);
};

const landing = (mod: LibraryModule): string => {
  const firstDoc = mod.docs?.[0];
  return firstDoc !== undefined ? docId(firstDoc.id) : (mod.stories[0]?.id ?? '');
};

export const resolvePage = (mod: LibraryModule, segments: string[]): string => {
  if (segments.length === 0) return landing(mod);
  if (segments.length === 1) {
    const [segment] = segments;
    if (mod.docs?.some((d) => d.id === segment) === true) return docId(segment!);
    if (mod.stories.some((s) => s.id === segment)) return segment!;
    const firstOfKind = mod.stories.find((s) => s.kind === segment);
    return firstOfKind !== undefined ? firstOfKind.id : landing(mod);
  }
  const storySegment = segments[segments.length - 1]!;
  return mod.stories.some((s) => s.id === storySegment) ? storySegment : landing(mod);
};

export const samePath = (a: string, b: string): boolean => {
  const norm = (path: string): string => {
    const trimmed = path.replace(/\/+$/, '');
    return trimmed === '' ? '/' : trimmed;
  };
  return norm(a) === norm(b);
};

export const initialRoute = (): { libraryId: string; pending: string[] } => {
  const segments = routeSegments();
  return { libraryId: segments[0] ?? START_ID, pending: segments.slice(1) };
};
