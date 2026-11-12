import { evaluate, ConfigSchema } from '@niscorp/prism';
import { PRISM_SEQUENCE } from '@niscorp/prism/migrations';
import { createUpgrader, defineSequence } from '@niscorp/strata';

// The nisc.haptic grammar. Version 0 has no migrations; a change to the artifact schema appends one.
export const HAPTIC_SEQUENCE = defineSequence({
  id: 'nisc.haptic',
  documents: {
    artifact: {
      embeds: { mapping: 'nisc.prism/config', 'stages[].references': 'nisc.prism/config' },
    },
  },
  migrations: [],
});

const upgrader = await createUpgrader([HAPTIC_SEQUENCE, PRISM_SEQUENCE], {
  transform: (config, source) => evaluate(ConfigSchema.parse(config), source),
});

// The stamp an artifact written now carries.
export const currentStamp = upgrader.stamp;

// An artifact written at an earlier stamp, rewritten to the current grammars.
export const upgradeArtifact = (document: unknown): unknown => {
  const stamp =
    document && typeof document === 'object'
      ? (document as { stamp?: Record<string, number> }).stamp
      : undefined;
  const result = upgrader.upgrade(document, { kind: 'nisc.haptic/artifact', stamp: stamp ?? null });
  return { ...result.document, stamp: result.stamp };
};
