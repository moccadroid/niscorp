import { livenessOf } from '@niscorp/nova/reflect';
import type { ActionDefinition } from '@niscorp/nova';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';

export type ShellNeed = {
  live: boolean;
  why: string[];
  drawnWith: string[];
};

const fingerprintOf = (request: unknown): string | undefined => {
  if (request === null || typeof request !== 'object' || Array.isArray(request)) return undefined;
  const fingerprint: unknown = Reflect.get(request, 'fingerprint');
  return typeof fingerprint === 'string' ? fingerprint : undefined;
};

export const shellNeedOf = (definition: ActionDefinition, entries: ReadonlyMap<string, SeedEntry | SeedMutation>): ShellNeed => {
  const facts = livenessOf(definition);
  const why: string[] = [];
  const drawnWith: string[] = [];

  if (facts.gestures) why.push('a person can act on it');
  if (facts.opaqueLayout) why.push('its layout is kept in the store, so what can be pressed on it is not readable');
  for (const channel of facts.listens) why.push(`it waits on the channel "${channel}"`);

  for (const use of facts.endpoints) {
    if (!use.onOpen && !use.later) continue;
    if (use.kind === 'fn') {
      why.push(`it calls the function endpoint "${use.name}", which is code`);
      continue;
    }
    const fingerprint = fingerprintOf(use.request);
    const entry = fingerprint === undefined ? undefined : entries.get(fingerprint);
    if (entry !== undefined && !('mutation' in entry) && entry.refresh === 'reactive') {
      why.push(`its read "${use.name}" keeps answering (${entry.fingerprint} is reactive)`);
      continue;
    }
    if (fingerprint !== undefined && entry === undefined) {
      why.push(`its read "${use.name}" replays "${fingerprint}", which the manifest does not carry — whether it keeps answering is not readable`);
      continue;
    }
    // An endpoint called only later adds no reason: the gesture or the channel
    // that calls it is already one.
    if (use.onOpen) drawnWith.push(fingerprint ?? use.url ?? use.name);
  }

  return { live: why.length > 0, why, drawnWith };
};
