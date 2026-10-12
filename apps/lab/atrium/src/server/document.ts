import { renderDocument } from '@niscorp/moss';
import type { DrawnDocument, MossServer, ShellSnapshot } from '@niscorp/moss';
import { renderSnapshot } from '@niscorp/moss/terminal/react/server';
import type { RenderNode } from '@niscorp/nova';
import { buildRegistry } from '@atrium/ui/registry';
import { atriumSlotWrapper } from '@atrium/ui/slot-wrapper';

const registry = buildRegistry();

// The kit's `Accent` writes `data-accent` on <html> from an effect, and an effect
// never runs here, so the page is given it in the markup, read off the same node.
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

export const drawing = {
  draw: (snapshot: ShellSnapshot): string => renderSnapshot({ snapshot, registry, slotWrapper: atriumSlotWrapper }),
  htmlAttributes: (snapshot: ShellSnapshot): Record<string, string> => {
    const accent = accentIn(snapshot);
    return accent === undefined ? {} : { 'data-accent': accent };
  },
};

export const renderPage = (config: { server: MossServer; template: string; path: string; cookie: string | null; host?: string | null }): Promise<DrawnDocument> =>
  renderDocument({ ...drawing, server: config.server, template: config.template, request: { path: config.path, cookie: config.cookie, host: config.host ?? null } });
