import { createUpgrader, defineSequence } from '@niscorp/strata';
import { evaluate, ConfigSchema } from '@niscorp/prism';
import { PRISM_SEQUENCE } from '@niscorp/prism/migrations';
export const ENGINE_SEQUENCE = defineSequence({
  id: 'eden.engine',
  documents: {
    artifact: { embeds: { flow: 'eden.engine/flow', 'flows[].flow': 'eden.engine/flow' } },
    flow: { embeds: { 'steps[]': 'eden.engine/step', output: 'nisc.prism/config' } },
    step: {
      embeds: {
        input: 'nisc.prism/config',
        value: 'nisc.prism/config',
        when: 'nisc.prism/config',
        'each.items': 'nisc.prism/config',
        'checks[].test': 'nisc.prism/config',
        'checks[].id': 'nisc.prism/config',
        output: 'nisc.prism/config',
      },
    },
  },
  migrations: [
    { description: 'Literal artifact data, pure values and computed check names', steps: [] },
  ],
});
// Preparation only. This is Strata's storage-blind document upgrader.
const upgrader = createUpgrader([ENGINE_SEQUENCE, PRISM_SEQUENCE], {
  transform: (config, source) => evaluate(ConfigSchema.parse(config), source),
});
export const artifactStamp = async (): Promise<Readonly<Record<string, number>>> => ({
  ...(await upgrader).stamp,
});
export const upgradeArtifact = async (
  document: unknown,
  stamp: Readonly<Record<string, number>>,
): Promise<unknown> => {
  const result = (await upgrader).upgrade(document, { kind: 'eden.engine/artifact', stamp });
  return { ...result.document, stamp: result.stamp };
};
