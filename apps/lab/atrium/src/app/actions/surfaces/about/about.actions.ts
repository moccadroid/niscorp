import type { ActionDefinition } from '@niscorp/nova';
import { aboutPageLayout, aboutWhoLayout } from './about.layouts';

// THE ABOUT PAGE — what `/about` draws (src/app/pages.ts). A page, not part of
// the app: it is drawn for whoever asks and nothing is kept behind it.
//
// `about.page` is the page itself, and is everybody's: its words are authored
// data, so there is nothing to read and nothing to press — its drawn tree is the
// whole of it. The words are the README's own opening.
export const aboutPageAction: ActionDefinition = {
  id: 'about.page',
  data: {
    eyebrow: 'About',
    title: 'Atrium',
    lead: 'A guest-and-staff platform for hotels, built by a third party that integrates property management systems.',
    body: 'One deployment serves two hotels on two different PMS backends and five audiences, from one URL. The application a token produces is not a filtered view of one screen. It is a different set of actions, resolved from what the integration behind that property can actually do.',
  },
  layout: aboutPageLayout,
};

// WHO IS LOOKING, for somebody who is signed in. An action a member is granted
// and nobody else is — so a stranger's page has no such strip, and nothing in a
// layout asks who anybody is. The name is boot input, like the chrome's. It has
// no way out and no way in on purpose: a button here would make the page need a
// shell for everyone who is signed in, and the page says who you are, not more.
export const aboutWhoAction: ActionDefinition = {
  id: 'about.who',
  data: { name: '' },
  layout: aboutWhoLayout,
};
