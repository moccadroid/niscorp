import { z } from 'zod';
import { ActionDefinitionSchema } from '@niscorp/nova';

// ═══════════════════════════════════════════════════════════════
// A BUNDLE: what an integration publishes at `<url>/bundle`.
//
// Five fields are nisc's own, and moss reads them: which integration it is,
// what it asks to be allowed, the grammars its documents are written in, its
// actions, and its words. One more, `extension`, is the host app's: whatever
// that app's own vocabulary lets a bundle say (a store listing, where a screen
// is placed, a setting a person may change). Moss keeps it and reads nothing
// inside it.
//
// The schema is strict: a top-level key that is none of these refuses the
// bundle (./intake.ts says so in a sentence). A package does not own a closed
// vocabulary for what is open, so there is no field here for one product's
// idea of a listing or a menu.
// ═══════════════════════════════════════════════════════════════

// WHAT AN INTEGRATION MAY BE CALLED. Its id is a segment of every path it is
// served under (`/integrations/<id>/…`) and a part of every action it ships
// (`ext.<audience>.<id>.<name>`, split on the dots), so it is lower-case
// letters, digits and hyphens, starting with a letter. No slash, no dot,
// nothing a path or a namespace reads as its own.
export const INTEGRATION_ID = /^[a-z][a-z0-9-]*$/;
export const INTEGRATION_ID_RULE = 'An integration id is lower-case letters, digits and hyphens, and starts with a letter.';

export const BundleSchema = z
  .object({
    integration: z.string().regex(INTEGRATION_ID, INTEGRATION_ID_RULE),
    // What it asks to be allowed: the actions it ships, as the charter names
    // them, and the data it reads and writes. An operator approves it once, at
    // registration: the approval is what grants it.
    grants: z
      .object({
        actions: z.array(z.string()).default([]),
        data: z.array(z.string()).default([]),
      })
      .default({ actions: [], data: [] }),
    // THE GRAMMARS ITS DOCUMENTS ARE WRITTEN IN: how far along each grammar
    // sequence (nova's, Prism's, the host's kit) they are. The host upgrades
    // them from here before anything else reads them, and refuses a bundle
    // written in a grammar newer than its own. Absent: the start of every
    // grammar.
    grammar: z.record(z.string(), z.number().int().nonnegative()).optional(),
    actions: z.record(z.string(), ActionDefinitionSchema),
    // ITS OWN WORDS, in the languages it speaks, as `language → source → text`.
    // Keyed by LANGUAGE, never by full locale: Vienna and Hamburg read the same
    // sentences, and region is money and dates, which do not come from a book.
    // The host merges these under its own book, so an integration cannot
    // rename a host word.
    phrasebook: z.record(z.string().regex(/^[a-z]{2}$/, 'a phrasebook is keyed by LANGUAGE (`de`), never by locale (`de-AT`)'), z.record(z.string(), z.string())).default({}),
    // THE HOST APP'S OWN VOCABULARY. Intake hands it to the schema the app
    // supplied (`extension` of `createIntegrations`, ./intake.ts); an app that
    // supplied none takes no bundle that carries one.
    extension: z.unknown().optional(),
  })
  .strict();

export type Bundle = z.infer<typeof BundleSchema>;
