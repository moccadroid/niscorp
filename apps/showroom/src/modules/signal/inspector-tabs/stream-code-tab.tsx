import type { FC } from 'react';
import { CodeView } from '../../../chrome/code-view';
import type { StreamStory } from '../story-types';

type Props = { story: StreamStory };

const LEGEND =
  'This is the actual code pattern used by this demo. Copy/paste into your project.';

const generateFallback = (story: StreamStory): string => {
  const { setup, solid } = story;
  const lines: string[] = [];
  lines.push(`import { createSignal } from '@niscorp/signal';`);
  if (solid) lines.push(`import { createStream } from '@niscorp/solid';`);
  lines.push('');
  lines.push(`const sig = createSignal('${setup.provider}')`);
  lines.push(`  .apiKey(process.env.${setup.provider.toUpperCase()}_API_KEY!)`);
  if (setup.model) lines.push(`  .model('${setup.model}')`);
  if (setup.systemPrompt) lines.push(`  .systemPrompt('...')`);
  if (setup.schema) lines.push(`  .schema(schema)`);
  lines.push('');
  if (solid) {
    lines.push(`let solid = createStream({ schema, initial });`);
    lines.push('');
    lines.push(`for await (const ev of sig.stream(input)) {`);
    lines.push(`  if (ev.type === 'text')  solid.write(ev.text);`);
    lines.push(`  if (ev.type === 'retry') {`);
    lines.push(`    solid.destroy();`);
    lines.push(`    solid = createStream({ schema, initial });`);
    lines.push(`  }`);
    lines.push(`  if (ev.type === 'done') solid.close();`);
    lines.push(`}`);
  } else {
    lines.push(`for await (const ev of sig.stream(${JSON.stringify(setup.input)})) {`);
    lines.push(`  if (ev.type === 'text') process.stdout.write(ev.text);`);
    lines.push(`  if (ev.type === 'done') console.log('\\nTokens:', ev.meta.usage.totalTokens);`);
    lines.push(`}`);
  }
  return lines.join('\n');
};

export const StreamCodeTab: FC<Props> = ({ story }) => {
  const source = story.code ?? generateFallback(story);
  return <CodeView legend={LEGEND} source={source} />;
};
