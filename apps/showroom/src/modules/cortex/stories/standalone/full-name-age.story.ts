import * as demo from './full-name-age.demo';
import source from './full-name-age.demo?raw';

export const story = {
  id: 'standalone.prism-mapping.full-name-age',
  name: 'Full name + age',
  description:
    "Cortex validates the agent's output against an envelope schema that embeds Prism's ConfigSchema directly — so the deep Prism Node tree is validated end-to-end on every call. Validation failures auto-retry. The Prism payload is the example; the substrate is the point.",
  category: 'Structured output (Prism mapping)',
  kind: 'standalone' as const,
  ...demo,
  source,
};
