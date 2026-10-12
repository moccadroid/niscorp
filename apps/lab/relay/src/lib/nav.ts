type Nav = {
  back: () => void;
  popTo: (canvas: string, instance: string) => void;
};

const noop: Nav = { back: () => undefined, popTo: () => undefined };

let nav: Nav = noop;

export const registerNav = (next: Nav): void => {
  nav = next;
};

export const navBack = (): void => nav.back();

// One message the shell executes atomically: chained back gestures race the
// browser's own history repair and drop presses.
export const navPopTo = (canvas: string, instance: string): void => nav.popTo(canvas, instance);
