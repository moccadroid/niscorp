// ═══════════════════════════════════════════════════════════════
// Which page a path leads to. A page's `path` is literal segments and `:name`
// parameters ("/docs/:slug"); a path matches a page when they have the same
// number of segments and every literal one is equal. Nothing else — no
// wildcards, no optional segments, no order to remember: two pages that could
// both answer one path are refused when the router is made, so which page a
// path leads to never depends on the order they were written in.
// ═══════════════════════════════════════════════════════════════

// WHAT THE ROUTER READS OF A PAGE: where it is drawn, which of its canvases
// the parameters of its path go to, and the canvases it has. A `PageManifest`
// (../manifest) is one of these.
export type PagePath = { path: string; params?: string; canvases: readonly { id: string }[] };

export type PageMatch = { name: string; params: Record<string, string> };
export type PageRouter = { match: (path: string) => PageMatch | undefined };

type Segment = { literal: string } | { param: string };
type Compiled = { name: string; segments: Segment[] };

const segmentsOf = (path: string): string[] => path.split('?')[0]?.split('/').filter((part) => part !== '') ?? [];

const compile = (name: string, page: PagePath): Compiled => {
  if (!page.path.startsWith('/')) throw new Error(`moss: page "${name}" has the path "${page.path}" — a page's path starts with "/".`);
  const segments = segmentsOf(page.path).map((part): Segment => (part.startsWith(':') ? { param: part.slice(1) } : { literal: part }));
  for (const segment of segments) {
    if ('param' in segment && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(segment.param)) {
      throw new Error(`moss: page "${name}" names the parameter ":${segment.param}" in "${page.path}" — a parameter is a plain name.`);
    }
  }
  // The parameters are handed over by name: one named twice has two segments
  // and one place to put them, so the later one would be kept and the first
  // matched and then lost.
  const named = segments.flatMap((segment) => ('param' in segment ? [segment.param] : []));
  const twice = named.find((param, index) => named.indexOf(param) !== index);
  if (twice !== undefined) {
    throw new Error(`moss: page "${name}" names the parameter ":${twice}" twice in "${page.path}" — give each parameter of a path its own name.`);
  }
  if (page.params !== undefined && !page.canvases.some((canvas) => canvas.id === page.params)) {
    throw new Error(`moss: page "${name}" sends its path's parameters to the canvas "${page.params}", which it does not have.`);
  }
  return { name, segments };
};

// Two patterns collide when some path satisfies both: same length, and no
// position where both are literal and differ.
const collide = (a: Compiled, b: Compiled): boolean =>
  a.segments.length === b.segments.length &&
  a.segments.every((segment, index) => {
    const other = b.segments[index];
    return other === undefined || 'param' in segment || 'param' in other || segment.literal === other.literal;
  });

export const createPageRouter = (pages: Readonly<Record<string, PagePath>>): PageRouter => {
  const compiled = Object.entries(pages).map(([name, page]) => compile(name, page));
  for (const [index, page] of compiled.entries()) {
    const other = compiled.slice(index + 1).find((candidate) => collide(page, candidate));
    if (other !== undefined) {
      throw new Error(`moss: pages "${page.name}" and "${other.name}" can both answer one path — give them paths that differ in a literal segment.`);
    }
  }

  return {
    match: (path) => {
      const parts = segmentsOf(path);
      for (const page of compiled) {
        if (page.segments.length !== parts.length) continue;
        const params: Record<string, string> = {};
        let matches = true;
        for (const [index, segment] of page.segments.entries()) {
          const part = parts[index];
          if (part === undefined) {
            matches = false;
            break;
          }
          if ('param' in segment) {
            try {
              params[segment.param] = decodeURIComponent(part);
            } catch {
              matches = false;
              break;
            }
          } else if (segment.literal !== part) {
            matches = false;
            break;
          }
        }
        if (matches) return { name: page.name, params };
      }
      return undefined;
    },
  };
};
