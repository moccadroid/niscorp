import { flushSync } from 'react-dom';
import type { ComponentRegistry } from '@niscorp/nova';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import type { Target } from '@niscorp/moss/terminal';
import { reactTarget } from '@niscorp/moss/terminal/react';
import { dropLayers, holdLayers, matches, moveLayers, settle, tidy } from './motion/layers';
import type { Layers, Pace } from './motion/layers';
import { instancesOf, sceneOf } from './motion/scene';
import { dropSlide, follow, holdSlide, playSlide, showNext } from './motion/slide';
import type { Slide } from './motion/slide';
import { cardsOf, gridOf, hideGrid, restingHeight } from './motion/stage';
import { fly, moveChip, saidNow, wayOf } from './motion/words';

// Updates that land within this long of each other are one move: the frame, then the canvases it holds.
const QUIET_MS = 60;
const LONGEST_MS = 350;
const MOVE_MS = 640;
const GIVE_UP_MS = 1500;

type Motion =
  | { kind: 'layers'; layers: Layers; turn: number; again: number }
  | { kind: 'slide'; slide: Slide; from: number | undefined; to: number | undefined; swipe?: 'following' | 'commit' | 'cancel'; back?: boolean; turn: number };

const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;
const paceOf = (): Pace => ({
  duration: reducedMotion() ? 200 : MOVE_MS,
  fold: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fold')) || 30,
  reduced: reducedMotion(),
});
const views = (): boolean => typeof document !== 'undefined' && typeof document.startViewTransition === 'function' && typeof ViewTransition !== 'undefined' && 'types' in ViewTransition.prototype;

// An answer's cards move on a stage of copies while the page's own are laid out unseen under it; back and forward slide
// the answer sideways, a finger's swipe carrying it; the overview opens and closes as a view transition. The dock is
// never part of a move: only its words travel.
export const miraTarget = (config: { root: HTMLElement; registry: ComponentRegistry<NovaComponent> }): Target => {
  const inner = reactTarget(config);
  return (api) => {
    const mount = inner(api);
    const root = document.documentElement;
    let shown = sceneOf(api);
    let painted = instancesOf(api);
    let motion: Motion | undefined;
    let turn = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let deadline: number | undefined;
    let deck: 'starting' | 'settling' | 'moving' | undefined;
    let heard: (() => void) | undefined;

    const kindOf = (): Motion['kind'] | undefined => motion?.kind;
    const paint = (): void => {
      flushSync(() => mount.update());
      shown = sceneOf(api);
      painted = instancesOf(api);
    };
    const soon = (run: () => void): void => {
      const now = performance.now();
      deadline ??= now + LONGEST_MS;
      clearTimeout(timer);
      timer = setTimeout(() => {
        deadline = undefined;
        run();
      }, Math.max(0, Math.min(QUIET_MS, deadline - now)));
    };
    const end = (): void => {
      clearTimeout(timer);
      deadline = undefined;
      if (motion?.kind === 'layers') dropLayers(motion.layers);
      if (motion?.kind === 'slide') dropSlide(motion.slide);
      motion = undefined;
      turn++;
      hideGrid(false);
      root.removeAttribute('data-swiped');
      root.style.removeProperty('--swipe-x');
    };

    const runLayers = (): void => {
      if (motion?.kind !== 'layers') return;
      const current = motion;
      const grid = gridOf();
      if (grid !== current.layers.grid || grid === null) return end();
      const mine = ++turn;
      current.turn = mine;
      settle(current.layers);
      void moveLayers(current.layers, cardsOf(grid, painted), restingHeight(grid), paceOf()).then(() => {
        if (motion !== current || current.turn !== mine) return;
        tidy(current.layers);
        if (matches(current.layers, cardsOf(grid, painted)) || current.again >= 2) return end();
        current.again++;
        runLayers();
      });
    };
    const startLayers = (): boolean => {
      const grid = gridOf();
      if (grid === null) return false;
      motion = { kind: 'layers', layers: holdLayers(grid, cardsOf(grid, painted)), turn: ++turn, again: 0 };
      hideGrid(true);
      return true;
    };

    const playTo = (to: 'end' | 'start'): void => {
      if (motion?.kind !== 'slide') return;
      const current = motion;
      const mine = ++turn;
      current.turn = mine;
      void playSlide(current.slide, to, paceOf()).then(() => {
        if (motion !== current || current.turn !== mine) return;
        if (to === 'start') {
          current.back = true;
          if (shown.at === current.from) end();
          return;
        }
        if (shown.at === current.to) return end();
        onward(current);
      });
    };
    // Pressed again before the first had landed: the answer it was going to is the one it leaves from.
    const onward = (current: Extract<Motion, { kind: 'slide' }>): void => {
      const { slide } = current;
      const sheet = slide.next;
      if (sheet === undefined) return end();
      const box = sheet.getBoundingClientRect();
      Object.assign(sheet.style, { position: 'fixed', top: `${box.top}px`, left: `${box.left}px`, translate: '' });
      document.body.append(sheet);
      slide.shown.remove();
      slide.shown = sheet;
      slide.next = undefined;
      slide.offset = 0;
      slide.direction = (shown.at ?? 0) < (current.to ?? 0) ? -1 : 1;
      current.from = current.to;
      runSlide();
    };
    const runSlide = (): void => {
      if (motion?.kind !== 'slide') return;
      const current = motion;
      if (current.swipe === 'cancel') {
        if (current.back === true && shown.at === current.from) end();
        return;
      }
      const grid = gridOf();
      if (grid === null || grid !== current.slide.grid) return end();
      if (shown.at === current.from || (current.slide.next !== undefined && current.swipe !== 'following')) return;
      showNext(current.slide, cardsOf(grid, painted), restingHeight(grid));
      current.to = shown.at;
      if (current.swipe !== 'following') playTo('end');
    };
    const startSlide = (direction: 1 | -1, swipe: boolean): boolean => {
      const grid = gridOf();
      if (grid === null) return false;
      motion = { kind: 'slide', slide: holdSlide(grid, cardsOf(grid, painted), direction), from: shown.at, to: undefined, ...(swipe ? { swipe: 'following' as const } : {}), turn: ++turn };
      hideGrid(true);
      if (!swipe) giveUp(motion);
      return true;
    };
    // A move whose answer never comes, or never comes back, ends on the page as it is.
    const giveUp = (current: Motion): void => {
      setTimeout(() => {
        if (motion === current && current.kind === 'slide' && (current.slide.next === undefined || current.swipe === 'cancel')) end();
      }, GIVE_UP_MS);
    };

    // A finger on the answer: the answer shown follows it at once, and the one it goes to joins it when it is drawn.
    const swipeX = (): number => Number.parseFloat(root.style.getPropertyValue('--swipe-x')) || 0;
    const carry = (): void => {
      if (motion?.kind !== 'slide' || motion.swipe !== 'following') return;
      follow(motion.slide, swipeX());
      requestAnimationFrame(carry);
    };
    const fingers = new MutationObserver(() => {
      const swiping = root.dataset['swiping'];
      const swiped = root.dataset['swiped'];
      if (swiping !== undefined && motion === undefined && deck === undefined && !shown.deck && startSlide(swiping === 'back' ? -1 : 1, true)) carry();
      if (swiped === undefined || motion?.kind !== 'slide' || motion.swipe !== 'following') return;
      follow(motion.slide, swipeX());
      root.removeAttribute('data-swiped');
      root.style.removeProperty('--swipe-x');
      giveUp(motion);
      if (swiped === 'commit') {
        motion.swipe = 'commit';
        if (motion.slide.next !== undefined) playTo('end');
      } else {
        motion.swipe = 'cancel';
        playTo('start');
      }
    });
    fingers.observe(root, { attributes: true, attributeFilter: ['data-swiping', 'data-swiped'] });

    // The overview: the answer shrinks into its picture among the rest, and grows back out of the one picked.
    const openOrClose = (opening: boolean): void => {
      deck = 'starting';
      let begun = false;
      const transition = document.startViewTransition({
        types: [opening ? 'deck-open' : 'deck-close'],
        update: () =>
          new Promise<void>((done) => {
            begun = true;
            deck = 'settling';
            const until = performance.now() + 450;
            let wait: ReturnType<typeof setTimeout> | undefined;
            const settled = (): void => {
              clearTimeout(wait);
              heard = undefined;
              deck = 'moving';
              done();
            };
            heard = () => {
              const left = until - performance.now();
              if (left <= 0) return settled();
              clearTimeout(wait);
              wait = setTimeout(settled, Math.min(70, left));
            };
            paint();
            heard();
          }),
      });
      // A page the browser is not drawing never takes the picture a move starts from: the update is drawn as it comes.
      setTimeout(() => {
        if (!begun) transition.skipTransition();
      }, 300);
      void transition.finished.finally(() => {
        deck = undefined;
        paint();
      });
    };

    const update = (): void => {
      if (deck === 'starting') return;
      const before = shown;
      const next = sceneOf(api);
      const said = saidNow();
      const reduced = reducedMotion();
      if (deck === 'settling') {
        paint();
        heard?.();
      } else if (deck === 'moving') paint();
      else if (next.deck !== before.deck && views()) {
        end();
        openOrClose(next.deck);
        return;
      } else if (next.region !== before.region) {
        if (motion === undefined) {
          if (before.asking || next.asking || next.at === before.at) startLayers();
          else startSlide((next.at ?? 0) < (before.at ?? 0) ? -1 : 1, false);
        }
        paint();
        const moving = kindOf();
        if (moving === 'layers') soon(runLayers);
        if (moving === 'slide') soon(runSlide);
      } else paint();

      if (!before.asking && shown.asking) {
        if (!reduced) fly(said, true);
        moveChip(said, 'landing', reduced);
      } else if (before.asking && !shown.asking && shown.error) {
        if (!reduced) fly(said, false);
        moveChip(said, -1, reduced);
      } else moveChip(said, wayOf(said), reduced);
    };

    return {
      update,
      destroy: () => {
        fingers.disconnect();
        end();
        mount.destroy();
      },
    };
  };
};
