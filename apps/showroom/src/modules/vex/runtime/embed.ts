import { createSignal } from '@niscorp/signal';
import { getKey } from '@showroom/modules/signal/settings/api-key-storage';
import { createOpenAIClient } from '@showroom/modules/signal/openai-client';
import embeddings from './product-embeddings.json';

const PRODUCT_EMBEDDINGS = embeddings as number[][];

const CANNED_QUERY_VECTORS: Record<string, number> = {
  'wireless noise-cancelling headphones': 7, // Sony WH-1000XM6
  'something to read on the beach': 21, // The Great Gatsby
  'gear for a weekend camping trip': 29, // Camping Tent 4P
  'a powerful laptop for software development': 3, // MacBook Pro 16"
};

const liveEmbed = async (text: string, dimensions?: number): Promise<number[]> => {
  const key = getKey('openai');
  if (key === undefined) {
    throw new Error(
      'Semantic search needs a query embedding. Set an OpenAI key in Signal → Settings, or use one of the canned queries.',
    );
  }
  const client = createOpenAIClient('openai', key);
  const embedder = createSignal('openai', { client }).apiKey(key).model('text-embedding-3-small');
  const vector = await embedder.embed(text, dimensions !== undefined ? { dimensions } : undefined);
  return vector as number[];
};

export const embed = async (text: string, dimensions?: number): Promise<number[]> => {
  const cannedIndex = CANNED_QUERY_VECTORS[text.trim().toLowerCase()];
  if (cannedIndex !== undefined && PRODUCT_EMBEDDINGS[cannedIndex]) {
    return PRODUCT_EMBEDDINGS[cannedIndex];
  }
  return liveEmbed(text, dimensions);
};
