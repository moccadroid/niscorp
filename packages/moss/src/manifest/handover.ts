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
// ═══════════════════════════════════════════════════════════════

export const receiveManifest = (app: NiscApp): void => {
  // `satisfies` is the type and the schema held to each other: a manifest the
  // compiler accepts is one the schema takes. A field whose type the schema
  // reads more narrowly than `NiscApp` declares it fails the build here,
  // where otherwise it would refuse a boot.
  const misfits = manifestMisfits(app satisfies z.input<typeof ManifestSchema>);
  if (misfits.length > 0) throw new Error(['The manifest does not parse — refusing to serve:', ...misfits.map((misfit) => `  ${misfit}`)].join('\n'));
};
