import type { Tide } from '@niscorp/tide';
import type { WriteEvent } from '@niscorp/vex';
import type { Feature, FeatureSeams } from '../feature';

export type FactIntake = Pick<Tide, 'ingest'>;

export type TideFactsConfig = {
  tide: () => FactIntake | undefined;
  identity: (scope: Record<string, unknown>) => string | undefined;
  chain?: (scope: Record<string, unknown>, hints: { cause: string; depth: number }) => { cause: string; depth: number } | undefined;
};

export const mintFromWrites = (config: TideFactsConfig, seams: Pick<FeatureSeams, 'onWrite'>): (() => void) =>
  seams.onWrite((event, request) => {
    const tide = config.tide();
    const as = tide !== undefined ? config.identity(event.scope) : undefined;
    if (tide === undefined || as === undefined) return;
    const hints = chainHintsOf(request);
    // With no `chain` gate the hints are dropped: a forged depth could park an
    // innocent chain, and a forged cause is made-up provenance.
    const chain = hints === undefined ? undefined : config.chain?.(event.scope, hints);
    mintWrites(tide, event, as, Date.now(), chain).catch((err) => console.error('[moss:facts]', err));
  });

export const createTideFacts = (config: TideFactsConfig): Feature => ({
  name: 'tide-facts',
  start: (seams) => {
    mintFromWrites(config, seams);
  },
});

export type ChainHints = { cause: string; depth: number };

// Digits only, not `Number()` alone: an empty header is 0 to it, and 0 is the
// start of a chain, so a chain whose depth was lost on the way would count
// from the beginning again.
const depthOf = (header: string | undefined): number | undefined => {
  if (header === undefined || !/^\d+$/.test(header)) return undefined;
  const depth = Number(header);
  return Number.isSafeInteger(depth) ? depth : undefined;
};

const chainHintsOf = (request: { header: (name: string) => string | undefined }): ChainHints | undefined => {
  const cause = request.header('x-tide-cause');
  const depth = depthOf(request.header('x-tide-depth'));
  return cause === undefined || cause === '' || depth === undefined ? undefined : { cause, depth };
};

const mintWrites = async (
  intake: Pick<Tide, 'ingest'>,
  event: WriteEvent,
  as: string,
  at: number,
  chain?: { cause: string; depth: number },
): Promise<void> => {
  for (const write of event.writes) {
    for (const row of write.rows) {
      await intake.ingest(
        { kind: 'write', entity: write.table, op: write.op, row, at },
        { as, ...(chain !== undefined ? { cause: chain.cause, depth: chain.depth + 1 } : {}) },
      );
    }
  }
};
