import type { Interface } from 'node:readline';
import type { TtyInteractive } from '@niscorp/nova/adapters/tty';

// The focused input of the REPL: while one is held, the next line typed is its
// value. Tracked by identity (canvas + ref), never by index — a repaint
// renumbers, identity survives the server echo.

export type Focus = {
  held: () => boolean;
  // focus this input: the prompt shows the field and what it holds
  enter: (item: TtyInteractive) => void;
  exit: () => void;
  // the focused input among what is on screen, if it is still there
  among: (interactives: readonly TtyInteractive[]) => TtyInteractive | undefined;
  // After a repaint: the prompt follows what the input holds now. If the input
  // left the screen (navigation, sign-out), focus drops with a note instead of
  // swallowing the next line silently.
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
