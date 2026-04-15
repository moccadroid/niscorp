import * as demo from './interpolate.demo';
import source from './interpolate.demo?raw';

export const story = {
  id: 'interpolate',
  name: '$interpolate',
  description: 'Replaces `{{key}}` placeholders in a template string with the matching values from an object. Both the template and the values can be expressions.',
  category: 'Operators',
  kind: 'transform' as const,
  ...demo,
  source,
};
