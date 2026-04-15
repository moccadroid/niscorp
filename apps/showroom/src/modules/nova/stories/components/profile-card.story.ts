import { Demo } from './profile-card.demo';
import source from './profile-card.demo?raw';

export const story = {
  id: 'profile-card',
  name: 'Profile card',
  description:
    'A composite profile card using all five primitives: Box, Stack, Text, Button, Input.',
  category: 'Components',
  kind: 'layout' as const,
  Demo,
  source,
};
