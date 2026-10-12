import type { Shell } from '@niscorp/nova';

const whole = new WeakMap<Shell, Shell>();

const refuse =
  (member: string) =>
  (): never => {
    throw new Error(
      `moss: ${member} was called on a session's shell. It changes what the shell is made of without moss: ` +
        'what it adds is not verified, is in nobody\'s catalog, and is gone when the shell is rebuilt. ' +
        'Code that means to do that takes the whole shell: `unverifiedShell(session)`, from `@niscorp/moss/unverified`.',
    );
  };

export const sessionShellOf = (shell: Shell): Shell => {
  const guarded: Shell = {
    ...shell,
    registerAction: refuse('registerAction'),
    removeAction: refuse('removeAction'),
    registerFragment: refuse('registerFragment'),
    addCanvas: refuse('addCanvas'),
    removeCanvas: refuse('removeCanvas'),
    setCanvasLayout: refuse('setCanvasLayout'),
    setLayout: refuse('setLayout'),
    setPhrases: refuse('setPhrases'),
    dispose: refuse('dispose'),
  };
  whole.set(guarded, shell);
  whole.set(shell, shell);
  return guarded;
};

export const wholeShellOf = (sessionShell: Shell): Shell => {
  const shell = whole.get(sessionShell);
  if (shell === undefined) throw new Error('moss: this is not the shell of a session moss built.');
  return shell;
};
