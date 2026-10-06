import { renderDocument } from '@niscorp/moss';
import type { DrawnDocument, MossServer, ShellSnapshot } from '@niscorp/moss';
import { renderSnapshot } from '@niscorp/moss/terminal/react/server';
import type { RenderNode } from '@niscorp/nova';
import { buildRegistry } from '@atrium/ui/registry';
import { atriumSlotWrapper } from '@atrium/ui/slot-wrapper';

// THE PAGE, DRAWN HERE. A page request is answered with the screen the server
// would have streamed a moment later: moss reads the caller's shell as it
// stands and writes it into index.html (`renderDocument`); this file is the two
// things only atrium knows — the kit that draws it, and what the kit would
// have put on <html>.
//
// Who is asking comes off the session cookie the browser keeps — moss writes
// it, no script can read it, and its name ends with the port the page is on,
// which is why the host is passed along.
//
// The dev server (vite.config.ts) and `nisc start` draw with the same
// description; a page that cannot be drawn goes out as index.html, undrawn.

// One registry for every page: the kit is the same for everybody.
const registry = buildRegistry();

// The property's palette is a `data-accent` on <html>, which the kit's `Accent`
// writes from an effect (src/ui/components/accent.tsx) — and an effect never
// runs here. So the page is given it in the markup, read off the same node the
// effect would have read it from: the colours are right before any script runs.
const accentIn = (snapshot: ShellSnapshot): string | undefined => {
  const find = (nodes: readonly RenderNode[]): string | undefined => {
    for (const node of nodes) {
      if (node.type === 'component' && node.name === 'Accent') {
        const name = node.props['name'];
        if (typeof name === 'string' && /^[a-z0-9-]+$/.test(name)) return name;
      }
      const inner = node.type === 'component' || node.type === 'fragment' ? find(node.children) : undefined;
      if (inner !== undefined) return inner;
    }
    return undefined;
  };
  return find(snapshot.frame) ?? Object.values(snapshot.trees).map(find).find((name) => name !== undefined);
};

// HOW ATRIUM'S PAGES ARE DRAWN — the one description, used by the dev server
// (vite.config.ts) and the `nisc` command (nisc.config.ts) — which is also what
// serves the built terminal (`nisc start`).
export const drawing = {
  draw: (snapshot: ShellSnapshot): string => renderSnapshot({ snapshot, registry, slotWrapper: atriumSlotWrapper }),
  htmlAttributes: (snapshot: ShellSnapshot): Record<string, string> => {
    const accent = accentIn(snapshot);
    return accent === undefined ? {} : { 'data-accent': accent };
  },
};

export const renderPage = (config: { server: MossServer; template: string; path: string; cookie: string | null; host?: string | null }): Promise<DrawnDocument> =>
  renderDocument({ ...drawing, server: config.server, template: config.template, request: { path: config.path, cookie: config.cookie, host: config.host ?? null } });
