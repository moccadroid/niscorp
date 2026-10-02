import { renderDocument } from '@niscorp/moss';
import type { DrawnDocument, MossServer, ShellSnapshot } from '@niscorp/moss';
import { renderSnapshot } from '@niscorp/moss/terminal/react/server';
import type { RenderNode } from '@niscorp/nova';
import { buildRegistry } from '@lyra/ui/registry';
import { lyraSlotWrapper } from '@lyra/ui/slot-wrapper';
import { themeDocumentAttributes } from '@lyra/ui/components/theme';

// THE PAGE, DRAWN HERE. A page request is answered with the screen the server
// would have streamed a moment later: moss reads the caller's shell as it
// stands and writes it into index.html (`renderDocument`); this file is the two
// things only lyra knows — the kit that draws it, and what the kit would have
// put on <html>.
//
// Who is asking comes off the cookie copy of the session token the wire keeps
// (src/main.tsx, `browserEnv({ cookie: true })`). It is read to draw this page
// and for nothing else.
//
// A page that cannot be drawn goes out as index.html, undrawn.

// One registry for every page: the kit is the same for everybody.
const registry = buildRegistry();

// A studio's palette is CSS custom properties on <html>, which the kit's `Theme`
// writes from an effect — and an effect never runs here. The page is given them
// in the markup, read off the same node the effect reads them from.
const themeTokensIn = (snapshot: ShellSnapshot): Record<string, string> | undefined => {
  const find = (nodes: readonly RenderNode[]): Record<string, string> | undefined => {
    for (const node of nodes) {
      if (node.type === 'component' && node.name === 'Theme') {
        const tokens: unknown = node.props['tokens'];
        if (tokens !== null && typeof tokens === 'object' && !Array.isArray(tokens)) {
          return Object.fromEntries(Object.entries(tokens).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
        }
      }
      const inner = node.type === 'component' || node.type === 'fragment' ? find(node.children) : undefined;
      if (inner !== undefined) return inner;
    }
    return undefined;
  };
  return find(snapshot.frame) ?? Object.values(snapshot.trees).map(find).find((tokens) => tokens !== undefined);
};

// HOW LYRA'S PAGES ARE DRAWN — the one description, used by the dev server
// (vite.config.ts) and the `nisc` command (nisc.config.ts).
export const drawing = {
  draw: (snapshot: ShellSnapshot): string => renderSnapshot({ snapshot, registry, slotWrapper: lyraSlotWrapper }),
  htmlAttributes: (snapshot: ShellSnapshot): Record<string, string> => themeDocumentAttributes(themeTokensIn(snapshot)),
};

export const renderPage = (config: { server: MossServer; template: string; path: string; cookie: string | null }): Promise<DrawnDocument> =>
  renderDocument({ ...drawing, server: config.server, template: config.template, request: { path: config.path, cookie: config.cookie } });
