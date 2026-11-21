import { evaluate, ConfigSchema } from '@niscorp/prism';
import { PRISM_SEQUENCE } from '@niscorp/prism/migrations';
import { createUpgrader, defineSequence } from '@niscorp/strata';

// The nisc.haptic grammar; a change to the artifact schema appends a migration.
export const HAPTIC_SEQUENCE = defineSequence({
  id: 'nisc.haptic',
  documents: {
    artifact: {
      embeds: {
        mapping: 'nisc.prism/config',
        'stages[].references': 'nisc.prism/config',
        'request.more': 'nisc.prism/config',
      },
    },
  },
  migrations: [
    {
      // A marker without steps: a version 0 artifact means the same at version 1, and a reader at 0 must refuse
      // an artifact that uses the additions.
      description:
        'inputs, a first request as a template (GET or POST, form or JSON body) and more pages: the next link, or the next request values from `more`',
      steps: [],
    },
  ],
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
