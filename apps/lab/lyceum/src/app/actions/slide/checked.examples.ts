import type { ActionDefinition, LayoutNode } from '@niscorp/nova';

export const WRONG_COLOUR = { component: 'Action', props: { ink: 'purple' } } satisfies LayoutNode;
export const WRONG_COLOUR_TEXT = ['{', "  component: 'Action',", "  props: { ink: 'purple' },", '}'].join('\n');

export const ECHO: ActionDefinition = {
  id: 'echo',
  title: 'Echo',
  data: {},
  layout: { component: 'Page' },
  triggers: [{ message: 'x', do: [{ emit: { channel: 'x' } }] }],
};
export const ECHO_TEXT = ['{', "  message: 'x',", "  do: [{ emit: { channel: 'x' } }],", '}'].join('\n');
