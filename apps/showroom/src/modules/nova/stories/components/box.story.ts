import { Demo } from './box.demo';
import source from './box.demo?raw';

export const story = {
  id: 'box',
  name: 'Box',
  description:
    'Demonstrates the Box styling primitive across its main props: bare padding only, padding with background and radius, padding with a border, and a dark filled variant with light text. Useful as a quick visual reference for combining Box props.',
  category: 'Components',
  kind: 'layout' as const,
  Demo,
  source,
};
