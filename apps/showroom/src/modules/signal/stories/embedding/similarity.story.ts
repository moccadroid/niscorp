import * as demo from './similarity.demo';
import source from './similarity.demo?raw';

export const story = {
  id: 'embedding-similarity',
  name: 'Embedding similarity',
  description:
    'Embed text into dense vectors and compare with cosine similarity. Same builder, different model.',
  category: 'Embedding',
  kind: 'stream' as const,
  ...demo,
  source,
};
