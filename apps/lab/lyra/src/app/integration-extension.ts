import { z } from 'zod';
import type { ExtensionConfig, ExtensionContext } from '@niscorp/moss/integrations';

// ═══════════════════════════════════════════════════════════════
// WHAT AN INTEGRATION MAY SAY TO LYRA, beyond the fields every nisc bundle has.
//
// A bundle's actions, grants and phrasebook are nisc's, and moss reads them.
// Where a screen of an integration appears in THIS app, and the words its
// store tile shows, are this app's own vocabulary: a bundle carries them under
// `extension`, moss hands them here, and what this file answers is what the
// integration's row keeps.
//
//   meta          the store tile's words: a title, a line, a paragraph
//   attachments   action id → the host screen it rides as a panel, with an
//                 endpoint of the integration's own that paints its strip
//   placements    action id → the menu hub it is listed under
//   settings      the one action the store tile opens
//
// `adds` is the sentence the store tile says of all three. It is written here,
// at import, and a bundle that brings one of its own is refused.
// ═══════════════════════════════════════════════════════════════

const ExtensionSchema = z
  .object({
    meta: z.object({ title: z.string().default(''), tagline: z.string().default(''), description: z.string().default('') }).strict().prefault({}),
    attachments: z.record(z.string(), z.object({ to: z.string(), preview: z.string().default('') }).strict()).default({}),
    placements: z.record(z.string(), z.string()).default({}),
    settings: z.string().default(''),
    adds: z.string().default(''),
  })
  .strict()
  // A bundle that says none of it is one with nothing to place.
  .prefault({});

export type IntegrationExtension = z.infer<typeof ExtensionSchema>;

// What this app offers an integration to name: the host screens a panel may
// ride, each with what it hands a rider ({offered key: where it is read from on
// this app's own data}); the menu hubs that list an integration's screen; and
// this app's words for both, for the sentence a person reads.
export type IntegrationOffer = {
  attachable: Readonly<Record<string, Readonly<Record<string, string>>>>;
  menuSlots: readonly string[];
  names: Readonly<Record<string, string>>;
};

// Each binding names an action the bundle ships and a place this app offers,
// and a preview stays under the integration's own prefix.
const refusals = (offer: IntegrationOffer, extension: IntegrationExtension, bundle: ExtensionContext): string[] => {
  const reasons: string[] = [];
  for (const [actionId, binding] of Object.entries(extension.attachments)) {
    if (bundle.actions[actionId] === undefined) reasons.push(`attachment ${actionId}: no such action in this bundle`);
    if (offer.attachable[binding.to] === undefined) reasons.push(`attachment ${actionId}: attaches to "${binding.to}", which offers nothing`);
    if (binding.preview !== '' && !binding.preview.startsWith(`/integrations/${bundle.integration}/`)) {
      reasons.push(`attachment ${actionId}: preview "${binding.preview}" is not under this integration's own prefix`);
    }
  }
  for (const [actionId, hub] of Object.entries(extension.placements)) {
    if (bundle.actions[actionId] === undefined) reasons.push(`placement ${actionId}: no such action in this bundle`);
    if (!offer.menuSlots.includes(hub)) reasons.push(`placement ${actionId}: targets "${hub}", which accepts no integrations`);
  }
  if (extension.settings !== '' && bundle.actions[extension.settings] === undefined) reasons.push(`settings: "${extension.settings}" is not an action in this bundle`);
  if (extension.adds !== '') reasons.push('adds: this app writes that sentence itself, from what the bundle places');
  return reasons;
};

// WHAT APPEARS WHERE, as the one sentence the store tile prints, in this app's
// own words for its screens and hubs. A place it has no word for is said by
// its id.
const placementSentence = (offer: IntegrationOffer, extension: IntegrationExtension, bundle: ExtensionContext): string => {
  const say = (id: string): string => offer.names[id] ?? id;
  const titled = (actionId: string): string => bundle.actions[actionId]?.title ?? actionId;
  const parts = [
    ...Object.entries(extension.attachments).map(([actionId, binding]) => `a "${titled(actionId)}" panel on ${say(binding.to)}`),
    ...Object.entries(extension.placements).map(([actionId, hub]) => `"${titled(actionId)}" under ${say(hub)}`),
    ...(extension.settings === '' ? [] : ['a settings screen on its store tile']),
  ];
  return parts.length === 0 ? '' : `Adds ${parts.join(' · ')}.`;
};

export const integrationExtension = (offer: IntegrationOffer): ExtensionConfig<IntegrationExtension> => ({
  schema: ExtensionSchema,
  check: (extension, bundle) => refusals(offer, extension, bundle),
  prepare: (extension, bundle) => ({ ...extension, adds: placementSentence(offer, extension, bundle) }),
  // What a vendor reads of this vocabulary. The offered keys are the contract:
  // where this app reads them from is its own wiring, and is not said.
  contract: {
    meta: 'title, tagline, description: the words of the store tile',
    attachments: 'action id → { to: a host screen below, preview?: an endpoint under your own prefix that answers { bands, hint } }',
    attachable: Object.fromEntries(Object.entries(offer.attachable).map(([action, offers]) => [action, Object.keys(offers)])),
    placements: 'action id → one of the menu hubs below',
    menuSlots: offer.menuSlots,
    settings: 'the id of the one action the store tile opens',
  },
});

// The path a preview is called at on the integration's own service: what its
// bundle declared, without the prefix it is served under here.
export const pathOnService = (integration: string, declared: string): string => declared.slice(`/integrations/${integration}/`.length);
