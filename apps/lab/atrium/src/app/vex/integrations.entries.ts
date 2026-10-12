import type { CacheEntry } from './index';

export const propertyIntegrations: CacheEntry = {
  fingerprint: 'integrations/forProperty',
  intent: 'The integrations one property runs, with kind and notes',
  shape: [{ connector_id: '', name: '', vendor: '', kind: '', notes: '' }],
  dsl: {
    from: ['connectors', 'property_connectors'],
    fields: [{ field: 'connectors.id', as: 'connector_id' }, 'connectors.name', 'connectors.vendor', 'connectors.kind', 'connectors.notes'],
    filter: { eq: ['property_connectors.property_id', { $context: 'propertyId' }] },
    sort: [{ field: 'connectors.kind', dir: 'asc' }],
    limit: 10,
  },
};

export const propertyServices: CacheEntry = {
  fingerprint: 'integrations/services',
  intent: "A connector's capabilities crossed with one property's switches",
  shape: [{ row_id: '', capability_id: '', label: '', blurb: '', provided: false, offered: false }],
  dsl: {
    from: ['connector_capabilities', 'capabilities', 'property_capabilities'],
    fields: [
      { field: 'property_capabilities.id', as: 'row_id' },
      { field: 'capabilities.id', as: 'capability_id' },
      'capabilities.label',
      'capabilities.blurb',
      { field: 'connector_capabilities.enabled', as: 'provided' },
      { field: 'property_capabilities.enabled', as: 'offered' },
    ],
    filter: {
      and: [
        { eq: ['connector_capabilities.connector_id', { $context: 'connectorId' }] },
        { eq: ['property_capabilities.property_id', { $context: 'propertyId' }] },
      ],
    },
    sort: [{ field: 'capabilities.id', dir: 'asc' }],
    limit: 40,
  },
};
