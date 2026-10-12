import type { Interface } from 'node:readline';
import type { TtyInteractive } from '@niscorp/nova/adapters/tty';

export type Focus = {
  held: () => boolean;
  enter: (item: TtyInteractive) => void;
  exit: () => void;
  among: (interactives: readonly TtyInteractive[]) => TtyInteractive | undefined;
  follow: (interactives: readonly TtyInteractive[], say: (text: string) => void) => void;
};

const valueText = (item: TtyInteractive): string => (typeof item.value === 'string' || typeof item.value === 'number' ? String(item.value) : '');
const focusPrompt = (item: TtyInteractive): string => `${item.path ?? item.ref} ⟨${valueText(item)}⟩ › `;

export const createFocus = (rl: Interface, basePrompt: string): Focus => {
  let focus: { canvas: string; ref: string; name: string } | null = null;
  const among = (interactives: readonly TtyInteractive[]): TtyInteractive | undefined => {
    const held = focus;
    if (held === null) return undefined;
    return interactives.find((item) => item.kind === 'model' && item.canvas === held.canvas && item.ref === held.ref);
  };
  const exit = (): void => {
    focus = null;
    rl.setPrompt(basePrompt);
  };
  return {
    held: () => focus !== null,
    enter: (item) => {
      focus = { canvas: item.canvas, ref: item.ref, name: item.path ?? item.ref };
      rl.setPrompt(focusPrompt(item));
      rl.prompt(true);
    },
    exit,
    among,
    follow: (interactives, say) => {
      if (focus === null) return;
      const still = among(interactives);
      if (still === undefined) {
        say(`input ${focus.name} left the screen`);
        exit();
      } else rl.setPrompt(focusPrompt(still));
    },
  };
};
