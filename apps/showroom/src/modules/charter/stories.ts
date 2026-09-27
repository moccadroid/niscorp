import type { Story } from '@showroom/modules/types';

import { WhoSeesWhat } from './pages/who-sees-what';
import whoSeesWhatSrc from './pages/who-sees-what?raw';
import { SameQuestion } from './pages/same-question';
import sameQuestionSrc from './pages/same-question?raw';
import { Refused } from './pages/refused';
import refusedSrc from './pages/refused?raw';
import { Build } from './pages/build';
import buildSrc from './pages/build?raw';

// Three pages, read in order — the landing page ("What charter is for", a doc)
// links them. Full-width: the charter, the phones and the SQL are on the page.
export const stories: readonly Story[] = [
  {
    id: 'who-sees-what',
    name: '1 · Who sees what',
    description: 'Four people, one app, one charter. Each phone is the real app resolved for that person — change their roles and watch it change.',
    category: 'Studio',
    kind: 'studio',
    doc: true,
    Demo: WhoSeesWhat,
    source: whoSeesWhatSrc,
  },
  {
    id: 'same-question',
    name: '2 · Same question, different answers',
    description: 'One request, asked as each person through the endpoint moss serves. The database answers each as themselves.',
    category: 'Studio',
    kind: 'studio',
    doc: true,
    Demo: SameQuestion,
    source: sameQuestionSrc,
  },
  {
    id: 'refused',
    name: '3 · Refused before it ships',
    description: 'A typo’d deny, a role cycle, a typo’d allow — what would ship, and what the verifier says at boot.',
    category: 'Studio',
    kind: 'studio',
    doc: true,
    Demo: Refused,
    source: refusedSrc,
  },
  {
    id: 'build',
    name: '4 · Write the charter',
    description: 'The policy as a grid you click: screens, tables and reach per role. Four phones and the verifier follow every click.',
    category: 'Studio',
    kind: 'studio',
    doc: true,
    Demo: Build,
    source: buildSrc,
  },
];
