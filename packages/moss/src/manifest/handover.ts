import type { z } from 'zod';
import type { NiscApp } from './app';
import { manifestMisfits } from './schema';
import type { ManifestSchema } from './schema';

// ═══════════════════════════════════════════════════════════════
// THE HAND-OVER — the moment a manifest stops being the app's to write and
// becomes what the server stands on.
//
// It is read by its schema (./schema.ts) before anything is derived from it,
// and a manifest that cannot be read refuses the boot, naming every place that
// does not fit.
//
// THEN IT IS FROZEN, deep and in place. An app that edited its manifest after
// handing it over used to be half served: the edit reached whatever read the
// record next and nothing that had already been derived from it, and no check
// had seen it. Now the edit throws where it is written (a module is strict
// code), so there is one way an app changes while it runs, and it is a call
// that verifies first: `replaceActions` (./running.ts).
// ═══════════════════════════════════════════════════════════════

// What is data: an array, or an object nobody constructed. A function is a
// seam, and an instance of a class is somebody's machinery (a kit hands a
// component's props over as a zod schema, which fills itself in as it is
// used): neither is frozen, and neither is looked inside.
const isData = (value: unknown): value is object => {
  if (typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) return true;
  const made = Object.getPrototypeOf(value);
  return made === Object.prototype || made === null;
};

// FROZEN, EVERY LEVEL OF IT, WHERE IT STANDS: no copy is made, so the object
// the caller still holds is the one that can no longer be written. A loop and
// not a recursion, for the reason ./schema.ts asks how deep a document nests;
// `seen`, because nothing says an app's data holds no object twice.
export const freezeDeep = (data: unknown): void => {
  const seen = new Set<object>();
  const pending: unknown[] = [data];
  while (pending.length > 0) {
    const value = pending.pop();
    if (!isData(value) || seen.has(value)) continue;
    seen.add(value);
    Object.freeze(value);
    for (const inner of Object.values(value)) pending.push(inner);
  }
};

export const receiveManifest = (app: NiscApp): void => {
  // `satisfies` is the type and the schema held to each other: a manifest the
  // compiler accepts is one the schema takes. A field whose type the schema
  // reads more narrowly than `NiscApp` declares it fails the build here,
  // where otherwise it would refuse a boot.
  const misfits = manifestMisfits(app satisfies z.input<typeof ManifestSchema>);
  if (misfits.length > 0) throw new Error(['The manifest does not parse — refusing to serve:', ...misfits.map((misfit) => `  ${misfit}`)].join('\n'));
  freezeDeep(app);
};
