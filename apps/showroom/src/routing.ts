import type { LibraryModule } from './modules/types';

// URL <-> page mapping for the showroom. The address of any page is the pair
// (library id, selection), where a selection is a story id or a `doc:<id>`. The
// URL shape:
//   /                         Start
//   /<lib>                    library landing (first doc, else first story)
//   /<lib>/<docId>            a doc            (e.g. /vex/design)
//   /<lib>/<kind>/<storyId>   a story          (e.g. /loom/plugins/prism-config)
// Docs are two segments, stories three, so depth disambiguates. Everything is
// computed from existing data (story id, doc id, story kind are already slugs),
// so there is no per-page slug to author.

export const START_ID = 'start';

const DOC_PREFIX = 'doc:';
export const docId = (id: string): string => `${DOC_PREFIX}${id}`;
export const isDocSelection = (id: string): boolean => id.startsWith(DOC_PREFIX);
export const stripDocPrefix = (id: string): string => id.slice(DOC_PREFIX.length);

// '/niscorp/' on GitHub Pages, '/' in dev. Always route through it; never
// hardcode the subpath.
const BASE = import.meta.env.BASE_URL;
const BASE_NO_SLASH = BASE.replace(/\/$/, '');

// The path segments after the base, e.g. ['loom', 'plugins', 'prism-config'].
export const routeSegments = (): string[] => {
  let path = window.location.pathname;
  if (BASE_NO_SLASH !== '' && path.startsWith(BASE_NO_SLASH)) path = path.slice(BASE_NO_SLASH.length);
  return path.split('/').filter((segment) => segment.length > 0);
};

const join = (...segments: string[]): string => BASE + segments.join('/');

// The URL for a selection. `mod` supplies a story's `kind` (the middle segment);
// during a library switch it may be absent, in which case the caller skips the
// write (the selection is not settled yet).
export const buildPath = (libraryId: string, selection: string, mod: LibraryModule | undefined): string => {
  if (libraryId === START_ID) return BASE;
  if (selection === '') return join(libraryId);
  if (isDocSelection(selection)) return join(libraryId, stripDocPrefix(selection));
  const story = mod?.stories.find((s) => s.id === selection);
  return story !== undefined ? join(libraryId, story.kind, story.id) : join(libraryId, selection);
};

// The library's default selection: its first doc, else its first story.
const landing = (mod: LibraryModule): string => {
  const firstDoc = mod.docs?.[0];
  return firstDoc !== undefined ? docId(firstDoc.id) : (mod.stories[0]?.id ?? '');
};

// Resolve URL segments (after the library) into a selection, against the loaded
// module. Unknown paths fall back to the landing.
export const resolvePage = (mod: LibraryModule, segments: string[]): string => {
  if (segments.length === 0) return landing(mod);
  if (segments.length === 1) {
    const [segment] = segments;
    if (mod.docs?.some((d) => d.id === segment) === true) return docId(segment!);
    if (mod.stories.some((s) => s.id === segment)) return segment!;
    const firstOfKind = mod.stories.find((s) => s.kind === segment);
    return firstOfKind !== undefined ? firstOfKind.id : landing(mod);
  }
  // /<lib>/<kind>/<story>: the kind segment is cosmetic, look up by story id.
  const storySegment = segments[segments.length - 1]!;
  return mod.stories.some((s) => s.id === storySegment) ? storySegment : landing(mod);
};

// Two paths equal up to a trailing slash (the base root carries one, our built
// paths do not).
export const samePath = (a: string, b: string): boolean => {
  const norm = (path: string): string => {
    const trimmed = path.replace(/\/+$/, '');
    return trimmed === '' ? '/' : trimmed;
  };
  return norm(a) === norm(b);
};

// Library id and pending segments parsed from the current URL, for initial load.
export const initialRoute = (): { libraryId: string; pending: string[] } => {
  const segments = routeSegments();
  return { libraryId: segments[0] ?? START_ID, pending: segments.slice(1) };
};
