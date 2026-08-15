import * as demo from './keys.demo';
import source from './keys.demo?raw';

export const story = {
  id: 'i18n-keys',
  name: 'Prose keys',
  description:
    'A member whose surname is “Pass”, beside a product called “Pass” — and “Pass → Zehnerblock” in the book. Four identical strings; two translate. Proseness is decided by the KEY (`title` yes, `name` never), and a BOUND text child is data while an authored one is prose — a distinction only the renderer can draw, because once a tree exists both are the same plain string.',
  category: 'i18n',
  kind: 'i18n' as const,
  ...demo,
  source,
};
