import { createStream } from '@niscorp/solid';
import { isStreamDemoStory, type StreamDemoStory } from '../story-types';
import type { StatusMap } from '../../types';

export const evaluateAll = async (stories: readonly unknown[]): Promise<StatusMap> => {
  const map: StatusMap = {};
  for (const story of stories) {
    if (!isStreamDemoStory(story)) continue;
    map[story.id] = evaluateStory(story);
  }
  return map;
};

const evaluateStory = (story: StreamDemoStory): 'gray' | 'green' | 'red' => {
  if (!story.expected) return 'gray';

  try {
    const stream = createStream({ schema: story.demo.schema, initial: story.demo.initial });

    // Feed entire JSON at once for evaluation
    stream.write(story.demo.json);
    stream.close();

    const final = stream.current();

    if (story.expected.finalValue) {
      const expected = JSON.stringify(story.expected.finalValue);
      const actual = JSON.stringify(final);
      if (expected !== actual) return 'red';
    }

    return 'green';
  } catch {
    return 'red';
  }
};
