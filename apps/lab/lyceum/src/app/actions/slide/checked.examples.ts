import type { ActionDefinition, LayoutNode } from '@niscorp/nova';

// THE TWO DOCUMENTS the checks slide shows, as the documents they are — the
// slide prints them, and the server runs the real checks on these same two
// (server/functions/room.functions.ts, `room.checks`): the kit's props schema
// on the first, nova's loop finder on the second.

// A button in a colour the kit does not have (ui/kit.ts, INKS).
export const WRONG_COLOUR = { component: 'Action', props: { ink: 'purple' } } satisfies LayoutNode;
export const WRONG_COLOUR_TEXT = ['{', "  component: 'Action',", "  props: { ink: 'purple' },", '}'].join('\n');

// An action that sends what it listens for.
export const ECHO: ActionDefinition = {
  id: 'echo',
  title: 'Echo',
  data: {},
  layout: { component: 'Page' },
  triggers: [{ message: 'x', do: [{ emit: { channel: 'x' } }] }],
};
export const ECHO_TEXT = ['{', "  message: 'x',", "  do: [{ emit: { channel: 'x' } }],", '}'].join('\n');
