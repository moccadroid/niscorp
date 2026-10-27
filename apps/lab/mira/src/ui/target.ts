import { flushSync } from 'react-dom';
import type { ComponentRegistry, RenderNode } from '@niscorp/nova';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import type { Target, TerminalApi } from '@niscorp/moss/terminal';
import { reactTarget } from '@niscorp/moss/terminal/react';

// What a move is made of: the answer's areas, which instances are on the canvases, what the chip says, the dock's
// state, and whether the deck is open. An update that changes none of it is drawn as it comes.
type Scene = { key: string; at: number | undefined; areas: string[]; deck: boolean; asking: boolean; error: boolean };

const sceneOf = (api: TerminalApi): Scene => {
  const parts: unknown[] = [];
  const chip: unknown[] = [];
  const areas: string[] = [];
  let at: number | undefined;
  let deck = false;
  let asking = false;
  let error = false;
  const walk = (nodes: readonly RenderNode[]): void => {
    for (const node of nodes) {
      if (node.type === 'component') {
        const { name, props } = node;
        if (name === 'Deck') {
          deck = true;
          continue;
        }
        if (name === 'Grid') at = typeof props['at'] === 'number' ? props['at'] : undefined;
        if (name === 'Grid' || name === 'Area') parts.push([name, props]);
        if (name === 'Area' && typeof props['name'] === 'string') areas.push(props['name']);
        if (name === 'ActionSlot') parts.push(props['instanceId']);
        if (name === 'Chip') chip.push(props['label'], props['ink']);
        if (name === 'Dock') {
          asking = props['asking'] === true;
          error = props['error'] === true;
        }
        if (name === 'CanvasSlot' && typeof props['canvasId'] === 'string') walk(api.canvasTree(props['canvasId']));
      }
      if (node.type === 'component' || node.type === 'fragment') walk(node.children);
    }
  };
  walk(api.frame());
  return { key: JSON.stringify([parts, deck ? [] : chip, deck, asking, error]), at, areas, deck, asking, error };
};

type Placed = { element: HTMLElement; name: string; row: number; column: number; span: number };

const placed = (): Placed[] =>
  [...document.querySelectorAll<HTMLElement>('.k-grid > .k-area')].map((element, at) => ({
    element,
    name: element.dataset['name'] ?? '',
    row: Number(element.dataset['row'] ?? at + 1),
    column: Number(element.dataset['column'] ?? 1),
    span: Number(element.dataset['span'] ?? 1),
  }));

// Under in its column: after it on a narrow screen, where every area is one column; on a wide one, in a later row over
// the same columns.
const under = (other: Placed, area: Placed, all: readonly Placed[]): boolean =>
  matchMedia('(min-width: 721px)').matches ? other.row > area.row && other.column < area.column + area.span && area.column < other.column + other.span : all.indexOf(other) > all.indexOf(area);

// A layer that comes or goes with nothing staying under it has nowhere to grow from or fold to: the layer above it grows
// over it or shrinks off it, and it is swept.
const sweep = (comes: (name: string) => boolean, stays: (name: string) => boolean): void => {
  const all = placed();
  for (const area of all) {
    if (!comes(area.name) || all.some((other) => under(other, area, all) && stays(other.name))) continue;
    area.element.style.setProperty('view-transition-class', `area ${area.name} swept`);
  }
};
const unswept = (): void => {
  for (const element of document.querySelectorAll<HTMLElement>('.k-area')) element.style.removeProperty('view-transition-class');
};

const typesOf = (from: Scene, to: Scene, quick: boolean): string[] => [
  from.at !== undefined && to.at !== undefined && to.at < from.at ? 'back' : 'forward',
  ...(to.deck && !from.deck ? ['deck-open'] : []),
  ...(from.deck && !to.deck ? ['deck-close'] : []),
  ...(to.asking && !from.asking ? ['ask'] : []),
  ...(to.error && !from.error ? ['error'] : []),
  ...(quick ? ['quick'] : []),
];

// Updates that land within this long of each other are one move: the frame, then the canvases it holds.
const QUIET_MS = 70;
const LONGEST_MS = 450;
const STARTS_WITHIN_MS = 300;

const moves = (): boolean => typeof document !== 'undefined' && typeof document.startViewTransition === 'function' && typeof ViewTransition !== 'undefined' && 'types' in ViewTransition.prototype;

// Every move is drawn as a view transition, and the stylesheet says how each part travels. One moves at a time: a move
// that arrives while another is under way waits for it, and then goes at a quicker pace.
export const miraTarget = (config: { root: HTMLElement; registry: ComponentRegistry<NovaComponent> }): Target => {
  const inner = reactTarget(config);
  return (api) => {
    const mount = inner(api);
    let shown = sceneOf(api);
    // starting: the picture a move starts from is not taken yet, so nothing may be drawn.
    let phase: 'still' | 'starting' | 'settling' | 'moving' = 'still';
    let waiting = false;
    let heard: (() => void) | undefined;
    let retype: (() => void) | undefined;
    const paint = (): boolean => {
      const before = shown.key;
      flushSync(() => mount.update());
      shown = sceneOf(api);
      return shown.key !== before;
    };
    const move = (quick: boolean): void => {
      const from = shown;
      const to = sceneOf(api);
      phase = 'starting';
      let begun = false;
      sweep(
        (name) => !to.areas.includes(name),
        (name) => to.areas.includes(name),
      );
      const transition = document.startViewTransition({
        types: typesOf(from, to, quick),
        update: () =>
          new Promise<void>((done) => {
            begun = true;
            phase = 'settling';
            const deadline = performance.now() + LONGEST_MS;
            let timer: ReturnType<typeof setTimeout> | undefined;
            const settled = (): void => {
              clearTimeout(timer);
              heard = undefined;
              retype = undefined;
              phase = 'moving';
              sweep(
                (name) => !from.areas.includes(name),
                (name) => from.areas.includes(name),
              );
              done();
            };
            heard = () => {
              const left = deadline - performance.now();
              if (left <= 0) return settled();
              clearTimeout(timer);
              timer = setTimeout(settled, Math.min(QUIET_MS, left));
            };
            paint();
            heard();
          }),
      });
      // What lands while the move settles is part of it, and says what kind of move it is too: the overview closing can
      // come a moment after the answer it opens.
      retype = () => {
        for (const type of typesOf(from, shown, quick)) transition.types.add(type);
      };
      // A page the browser is not drawing never takes the picture a move starts from: the move is skipped, and the
      // update drawn as it comes.
      setTimeout(() => {
        if (!begun) transition.skipTransition();
      }, STARTS_WITHIN_MS);
      transition.finished.finally(() => {
        unswept();
        phase = 'still';
        if (!waiting) return;
        waiting = false;
        if (sceneOf(api).key === shown.key) paint();
        else move(true);
      });
    };
    return {
      update: () => {
        if (phase === 'starting') return;
        if (phase === 'settling') {
          if (paint()) {
            retype?.();
            heard?.();
          }
          return;
        }
        const next = sceneOf(api);
        if (next.key === shown.key) {
          if (!waiting) paint();
          return;
        }
        if (phase === 'moving') {
          waiting = true;
          return;
        }
        if (moves()) move(false);
        else paint();
      },
      destroy: mount.destroy,
    };
  };
};
