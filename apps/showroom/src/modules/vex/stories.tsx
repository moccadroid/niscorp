import type { FC } from 'react';
import type { Story } from '@showroom/modules/types';
import { scenarios, type VexScenario } from './scenarios';
import { VexView } from './vex-view';
import { buildSource } from './source';

// Each scenario becomes a chrome Story. The scenario rides along as an
// extra so the inspector tabs can read the DSL / SQL / cache meta.
const toStory = (scenario: VexScenario): Story => {
  const Demo: FC = () => <VexView scenario={scenario} />;
  Demo.displayName = `VexDemo(${scenario.id})`;
  return {
    id: scenario.id,
    name: scenario.name,
    description: scenario.description,
    category: '', // single (empty) sub-group; kind drives the headers
    kind: scenario.kind,
    Demo,
    source: buildSource(scenario),
    scenario,
  };
};

export const stories: readonly Story[] = scenarios.map(toStory);
