import { livenessOf } from '@niscorp/nova/reflect';
import type { ActionDefinition } from '@niscorp/nova';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// ═══════════════════════════════════════════════════════════════
// DOES THIS SCREEN NEED A SHELL — the verdict, composed.
//
// nova reports what an action can still do once it has been drawn (its
// `livenessOf`: gestures, channels, endpoints and when each is called). It
// cannot say what answers a url. Moss can: the entries behind each fingerprint
// are in the manifest, so "this read keeps answering" is a lookup, not a guess.
//
// A screen is LIVE when something on it can still happen — and then it needs a
// shell standing behind it and a socket to reach it. Otherwise its tree is the
// whole of it: drawn once, kept by nothing.
//
// Everything here is read off artifacts. The one thing that is not an artifact
// is code — a `fn:` endpoint — and code is counted live without being read:
// what a function does later is not written anywhere this can look.
// ═══════════════════════════════════════════════════════════════

export type ShellNeed = {
  live: boolean;
  // one sentence per reason, for a report a person reads before choosing how a
  // page is served ("docs.search: a person can act on it")
  why: string[];
  // reads made while the action opened: their answers are IN the drawn tree, so
  // a page kept after it was drawn shows them as they were then
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
    // A replay of something the manifest does not carry (an entry seeded into
    // the database some other way) may be reactive too. It cannot be read here,
    // so it is not concluded finished.
    if (fingerprint !== undefined && entry === undefined) {
      why.push(`its read "${use.name}" replays "${fingerprint}", which the manifest does not carry — whether it keeps answering is not readable`);
      continue;
    }
    // Called only because of something that happens later: the gesture or the
    // channel that calls it is already a reason above.
    if (use.onOpen) drawnWith.push(fingerprint ?? use.url ?? use.name);
  }

  return { live: why.length > 0, why, drawnWith };
};
