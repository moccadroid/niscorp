import type { RenderNode } from '@niscorp/nova';
import type { TerminalApi } from '@niscorp/moss/terminal';

// What is drawn, as far as motion is concerned. `region` changes when the answer's cards change: its areas, where they
// sit, their inks and marks, and which canvas instance each holds.
export type Scene = { region: string; at: number | undefined; deck: boolean; asking: boolean; error: boolean };

export const sceneOf = (api: TerminalApi): Scene => {
  const region: unknown[] = [];
  let at: number | undefined;
  let deck = false;
  let asking = false;
  let error = false;
  const walk = (nodes: readonly RenderNode[], inRegion: boolean): void => {
    for (const node of nodes) {
      if (node.type === 'component') {
        const { name, props } = node;
        if (name === 'Deck') {
          deck = true;
          continue;
        }
        if (name === 'Grid') at = typeof props['at'] === 'number' ? props['at'] : undefined;
        if (name === 'Grid' || name === 'Area') region.push([name, props]);
        if (name === 'ActionSlot' && inRegion) region.push(props['instanceId']);
        if (name === 'Dock') {
          asking = props['asking'] === true;
          error = props['error'] === true;
        }
        const inside = inRegion || name === 'Grid';
        if (name === 'CanvasSlot' && typeof props['canvasId'] === 'string') walk(api.canvasTree(props['canvasId']), inside);
        walk(node.children, inside);
      }
      if (node.type === 'fragment') walk(node.children, inRegion);
    }
  };
  walk(api.frame(), false);
  return { region: JSON.stringify(region), at, deck, asking, error };
};

// Which instance each area of the answer's grid holds: a card is the same card while its instance stays, wherever it
// moves.
export const instancesOf = (api: TerminalApi): Map<string, string> => {
  const held = new Map<string, string>();
  const instanceIn = (nodes: readonly RenderNode[]): string | undefined => {
    for (const node of nodes) {
      if (node.type === 'component' && node.name === 'ActionSlot' && typeof node.props['instanceId'] === 'string') return node.props['instanceId'];
      if (node.type === 'component' || node.type === 'fragment') {
        const found = instanceIn(node.children);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };
  const walk = (nodes: readonly RenderNode[], inGrid: boolean): void => {
    for (const node of nodes) {
      if (node.type === 'fragment') walk(node.children, inGrid);
      if (node.type !== 'component') continue;
      const { name, props } = node;
      if (name === 'Area' && inGrid && typeof props['name'] === 'string') {
        const instance = instanceIn(node.children);
        if (instance !== undefined) held.set(props['name'], instance);
      } else if (name === 'CanvasSlot' && typeof props['canvasId'] === 'string') walk(api.canvasTree(props['canvasId']), inGrid);
      else walk(node.children, inGrid || name === 'Grid');
    }
  };
  walk(api.frame(), false);
  return held;
};
