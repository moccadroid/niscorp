import assert from 'node:assert/strict';
import { z } from 'zod';
import { discoveryProfile } from '../../src/discovery/index.js';
import { blueprint, builderContracts } from '../../src/discovery/blueprint.js';

// Private-job fixtures expose only the current source scope. Capture materialization and
// rejection of foreign root state are covered separately at their actual boundaries.
const defaults = {
  instruction: 'Read the current source.',
  asOf: null,
  schema: null,
  task: { requiresNavigation: false, resultFlow: null },
  part: 'initial',
  blueprint,
  policy: discoveryProfile.traversal,
  authoring: discoveryProfile.authoring,
  resources: discoveryProfile.resources,
  formats: discoveryProfile.formats,
  resultFlows: discoveryProfile.resultFlows,
  htmlContext: discoveryProfile.htmlContext,
  diagnostics: discoveryProfile.diagnostics,
  minimumResultMatches: discoveryProfile.minimumResultMatches,
  settings: discoveryProfile.settings,
  responseAttempts: discoveryProfile.author.maxResponseAttempts,
  maxInputBytes: discoveryProfile.maxInputBytes,
  observations: discoveryProfile.observations,
  allowance: { steps: 12, ms: 300000 },
  histories: [],
  repairFeedback: null,
  repairCount: 0,
  feedback: { failure: null, inspection: null },
};

export const sourceJob = <T extends object>(current: T): Omit<typeof defaults, keyof T> & T => ({
  ...defaults,
  ...current,
});

export const sourceJobInput = (id: string, input: unknown): Record<string, unknown> => {
  const contract = builderContracts[id];
  assert(contract, 'Missing source job contract: ' + id);
  const properties = z
    .object({ properties: z.record(z.string(), z.json()) })
    .parse(contract.inputSchema).properties;
  const values = z.record(z.string(), z.unknown()).parse(input);
  return Object.fromEntries(
    Object.keys(properties)
      .filter((key) => Object.hasOwn(values, key))
      .map((key) => [key, values[key]]),
  );
};
