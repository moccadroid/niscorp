import type { ActionDefinition } from '@niscorp/nova';
import { loginLayout } from './login.layout';

// The way in — and the anonymous principal's entire application.
//
// There is no password field here and there is not going to be one. A person
// gives an address, the server sends a link, the link carries a session. In the
// lab the "link" is printed to the console and the picker below stands in for a
// mail client; what the browser does is identical either way, which is the
// point of keeping the seam at `session.grant`.
//
// Signing in is an ordinary `fn:` endpoint. Nothing here is a reserved channel
// and nothing redirects: granting a session hands the terminal a new token, it
// reconnects as that principal, and what mounts is whatever THAT person's
// charter grants. The login page does not "navigate to the app" — it stops
// existing, because `auth.login` is not in a member's universe.
export const authLoginAction: ActionDefinition = {
  id: 'auth.login',
  title: 'Sign in',
  data: {
    email: '',
    sent: false,
    error: '',
    busy: false,
    // The lab's stand-in for an inbox: every seeded person, so a demo can be
    // driven without reading a console. Seeded by `inputs` — the anonymous
    // principal is still a principal, and this is what the server knows about
    // it. Real auth deletes this key and the layout that reads it.
    people: [],
  },
  layout: loginLayout,
  endpoints: {
    request: { fn: 'auth.request', errorTarget: 'error' },
    enter: { fn: 'auth.enter', errorTarget: 'error' },
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'send',
      do: [
        { set: 'error', value: '' },
        { set: 'busy', value: true },
        {
          call: 'request',
          onSuccess: [
            { set: 'busy', value: false },
            { set: 'sent', value: true },
          ],
          onError: [{ set: 'busy', value: false }],
        },
      ],
    },
    // The picker: choosing a name IS the auth in the lab, exactly as clicking
    // the link would be. One trigger, because the payload carries who.
    {
      event: 'ui:click',
      ref: 'as',
      do: [
        { set: 'error', value: '' },
        { set: 'email', value: '@event.payload.email' },
        { call: 'enter', onError: [{ set: 'busy', value: false }] },
      ],
    },
    { event: 'ui:click', ref: 'back', do: [{ set: 'sent', value: false }] },
  ],
};
