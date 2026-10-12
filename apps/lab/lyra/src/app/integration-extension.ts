import { z } from 'zod';
import type { ExtensionConfig, ExtensionContext } from '@niscorp/moss/integrations';

const ExtensionSchema = z
  .object({
    meta: z.object({ title: z.string().default(''), tagline: z.string().default(''), description: z.string().default('') }).strict().prefault({}),
    attachments: z.record(z.string(), z.object({ to: z.string(), preview: z.string().default('') }).strict()).default({}),
    placements: z.record(z.string(), z.string()).default({}),
    settings: z.string().default(''),
    adds: z.string().default(''),
  })
  .strict()
  .prefault({});

export type IntegrationExtension = z.infer<typeof ExtensionSchema>;

// `attachable`: host action → { offered key: the path it is read from on this
// app's own data }.
export type IntegrationOffer = {
  attachable: Readonly<Record<string, Readonly<Record<string, string>>>>;
  menuSlots: readonly string[];
  names: Readonly<Record<string, string>>;
};

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
  contract: {
    meta: 'title, tagline, description: the words of the store tile',
    attachments: 'action id → { to: a host screen below, preview?: an endpoint under your own prefix that answers { bands, hint } }',
    attachable: Object.fromEntries(Object.entries(offer.attachable).map(([action, offers]) => [action, Object.keys(offers)])),
    placements: 'action id → one of the menu hubs below',
    menuSlots: offer.menuSlots,
    settings: 'the id of the one action the store tile opens',
  },
});

export const pathOnService = (integration: string, declared: string): string => declared.slice(`/integrations/${integration}/`.length);
