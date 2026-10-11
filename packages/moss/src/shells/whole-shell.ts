import type { Shell } from '@niscorp/nova';

// THE SHELL A SESSION HANDS OUT is the nova shell with nine members refusing:
// the ones that change what a shell is made of. An action, a fragment, a
// canvas, a layout and the phrases reach a shell through moss, which verifies
// them and decides who holds them; added on the shell itself they are not
// verified, are in nobody's catalog, and are gone when the shell is rebuilt.
// Everything else (reads, navigation, messages, observers) works as on the
// shell itself.
//
// The whole shell is handed out by one entry point,
// `@niscorp/moss/unverified`, so code that goes around moss says so in its
// imports. This is where it is found again: each session shell is noted with
// the shell it stands for when it is made. The map holds nothing alive.
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
  return guarded;
};

export const wholeShellOf = (sessionShell: Shell): Shell => {
  const shell = whole.get(sessionShell);
  if (shell === undefined) throw new Error('moss: this is not the shell of a session moss built.');
  return shell;
};
