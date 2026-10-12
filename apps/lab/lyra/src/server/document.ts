import { renderDocument } from '@niscorp/moss';
import type { DrawnDocument, MossServer, ShellSnapshot } from '@niscorp/moss';
import { renderSnapshot } from '@niscorp/moss/terminal/react/server';
import type { RenderNode } from '@niscorp/nova';
import { buildRegistry } from '@lyra/ui/registry';
import { lyraSlotWrapper } from '@lyra/ui/slot-wrapper';
import { themeDocumentAttributes } from '@lyra/ui/components/theme';

const registry = buildRegistry();

// The kit's `Theme` writes a studio's palette onto <html> from an effect, and an
// effect never runs in a server render: the tokens go into the markup instead.
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

export const drawing = {
  draw: (snapshot: ShellSnapshot): string => renderSnapshot({ snapshot, registry, slotWrapper: lyraSlotWrapper }),
  htmlAttributes: (snapshot: ShellSnapshot): Record<string, string> => themeDocumentAttributes(themeTokensIn(snapshot)),
};

export const renderPage = (config: { server: MossServer; template: string; path: string; cookie: string | null; host?: string | null }): Promise<DrawnDocument> =>
  renderDocument({ ...drawing, server: config.server, template: config.template, request: { path: config.path, cookie: config.cookie, host: config.host ?? null } });
