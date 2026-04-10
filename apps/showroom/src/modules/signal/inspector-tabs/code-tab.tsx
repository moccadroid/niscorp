import type { FC } from 'react';
import { CodeView } from '../../../chrome/code-view';
import type { RecipeStory } from '../story-types';

// ═══════════════════════════════════════════════════════════
// Code tab — copy-pasteable TypeScript snippet that recreates
// this recipe in a real project. Recipes opt in by providing
// `code` on the story; otherwise we generate a generic one.
// ═══════════════════════════════════════════════════════════

const LEGEND =
  'Copy/paste this into your TypeScript project. Set the API key env var, install @niscorp/signal, and run.';

type Props = { story: RecipeStory };

const generateFallback = (story: RecipeStory): string => {
  const setup = story.setup;
  const lines: string[] = [];
  lines.push(`import { createSignal } from '@niscorp/signal';`);
  lines.push('');
  lines.push(`const result = await createSignal('${setup.provider}')`);
  lines.push(`  .apiKey(process.env.${setup.provider.toUpperCase()}_API_KEY!)`);
  if (setup.model !== undefined) lines.push(`  .model('${setup.model}')`);
  if (setup.systemPrompt !== undefined) {
    lines.push(`  .systemPrompt(${JSON.stringify(setup.systemPrompt)})`);
  }
  lines.push(`  .complete(${JSON.stringify(setup.input)});`);
  lines.push('');
  lines.push(`console.log(result.response);`);
  return lines.join('\n');
};

export const CodeTab: FC<Props> = ({ story }) => {
  const source = story.code ?? generateFallback(story);
  return <CodeView legend={LEGEND} source={source} />;
};
