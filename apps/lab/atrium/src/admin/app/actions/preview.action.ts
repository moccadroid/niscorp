import type { ActionDefinition } from '@niscorp/nova';

// The render target — a declared action whose layout is REPLACED at preview
// time with whatever the app server sent back.
//
// It exists as a real catalog entry rather than an id conjured at runtime so
// that everything stays inside the rules the rest of the stack lives by: it is
// covered by the operator's `admin.*` grant, moss's closure audit can see the
// push aimed at it, and `shell.registerAction` is doing what it says on the tin
// — replacing a definition the shell already knew — instead of smuggling in an
// id no charter ever resolved.
//
// The placeholder below is what you would see if a preview were pushed without
// being prepared, which should never happen and therefore says so.
export const previewAction: ActionDefinition = {
  id: 'admin.preview',
  title: 'Preview',
  data: {},
  layout: { component: 'Empty', props: { icon: 'alert', title: 'Nothing to preview', hint: 'This action takes its layout from the app server at preview time.' } },
};
