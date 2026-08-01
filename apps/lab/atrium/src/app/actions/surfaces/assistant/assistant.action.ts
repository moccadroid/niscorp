import type { ActionDefinition } from '@niscorp/nova';
import { assistantLayout } from './assistant.layout';

// The window onto the CHAT agent. The agent itself lives server-side, bound
// to the session (see server/assistant); this action is one surface
// onto it — a dock every principal carries on its own canvas.
//
// The transcript is ROWS: `assistant/turns` is the caller's own conversation
// (user-pinned by scope, chat rows alone), so it survives logout and reads back
// on mount. A send persists the user's line and the reply server-side — this
// action only ever re-reads. What the WATCHER does never renders here: its
// cards land on the shell itself, its record in the admin timeline.
export const assistantAction: ActionDefinition = {
  id: 'assistant',
  title: 'Assistant',
  // `profile.watched` is whether a watcher is on this person's screen — the
  // `nudge` button wakes it, and with nobody watching there is nothing to
  // press. `profile.scope` feeds the territory frame.
  data: { open: false, turns: [], draft: '', sent: '', pending: '', thinking: false, seconds: 0, profile: {} },
  layout: assistantLayout,
  endpoints: {
    load: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: 'assistant/turns', context: {} },
      target: 'turns',
    },
    send: { fn: 'assistant.send' },
    // Runs the watcher against the screen as it stands. It returns whether a run
    // started, which is false only when nobody is watching this person.
    nudge: { fn: 'assistant.nudge' },
    // The watcher's own resolution, read once on mount. A `fn:` rather than a
    // query: asking the same code that attaches the watcher is what keeps the
    // button, the frame and the watcher agreeing about who is watched.
    profile: { fn: 'assistant.profile', target: 'profile' },
  },
  lifecycle: { mount: [{ call: 'load' }, { call: 'profile' }] },
  triggers: [
    { event: 'ui:click', ref: 'open', do: [{ set: 'open', value: true }] },
    // Optimistic spinner: the run is server side and lights `thinking` itself a
    // beat later, and a button that looks dead for that beat gets pressed twice.
    { event: 'ui:click', ref: 'nudge', do: [{ set: 'thinking', value: true }, { call: 'nudge' }] },
    { event: 'ui:click', ref: 'close', do: [{ set: 'open', value: false }] },
    { event: 'ui:model', ref: 'draft', do: [{ set: 'draft', value: '@event.payload' }] },
    {
      event: 'ui:click',
      ref: 'send',
      do: [
        // Stash what is being sent (the fn reads `sent`), show it optimistically
        // as `pending`, and free the composer for the next thought.
        { set: 'sent', from: 'draft' },
        { set: 'pending', from: 'draft' },
        { set: 'draft', value: '' },
        { set: 'thinking', value: true },
        {
          call: 'send',
          onSuccess: [{ set: 'thinking', value: false }, { set: 'pending', value: '' }, { call: 'load' }],
          onError: [{ set: 'thinking', value: false }, { set: 'pending', value: '' }, { call: 'load' }],
        },
      ],
    },
    // The person changed how much screen the watcher holds — re-read, so the
    // territory frame and the button follow without a re-login.
    { message: 'settings-changed', do: [{ call: 'profile' }] },
    // THE WATCHER IS THINKING. A run nobody asked for still takes seconds, and
    // a card appearing with no warning reads as a glitch — so the watcher shows
    // the same spinner a typed question does. NO message trigger carries it:
    // nova fires message triggers without the published payload, so a count on
    // a channel cannot reach this layout — `@event.payload` resolves to nothing
    // and the template renders as its own source text. The watcher sets
    // `thinking` and `seconds` on this instance directly instead; it runs
    // server-side and holds the shell, and moss flushes the change like any
    // other.
  ],
};
