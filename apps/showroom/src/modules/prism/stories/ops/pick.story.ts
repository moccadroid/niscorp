import * as demo from './pick.demo';
import source from './pick.demo?raw';

export const story = {
  id: 'pick',
  name: '$pick',
  description: 'Keep only specific keys from an object, dropping the rest. Useful for stripping internal fields before sending data to a client.',
  category: 'Operators',
  kind: 'transform' as const,
  ...demo,
  source,
};
