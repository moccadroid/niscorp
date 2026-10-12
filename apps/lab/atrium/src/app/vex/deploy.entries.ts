import type { CacheEntry, MutationEntry } from './index';
import { stampText } from '@atrium/app/prisms/format.prism';

export const connectorsList: CacheEntry = {
  fingerprint: 'connectors/list',
  intent: 'Every PMS connector with its live version and service endpoint',
  shape: [{ connector_id: '', name: '', vendor: '', live_version: 0, service_url: '', notes: '' }],
  dsl: {
    from: ['connectors'],
    fields: [{ field: 'connectors.id', as: 'connector_id' }, 'connectors.name', 'connectors.vendor', 'connectors.live_version', 'connectors.service_url', 'connectors.notes'],
    sort: [{ field: 'connectors.name', dir: 'asc' }],
    limit: 20,
  },
};

export const connectorOffer: CacheEntry = {
  fingerprint: 'connectors/offer',
  intent: 'Every capability one connector implements, with its enabled switch',
  shape: [{ row_id: '', capability_id: '', label: '', blurb: '', enabled: false, version: 0 }],
  dsl: {
    from: ['connector_capabilities', 'capabilities'],
    fields: [
      { field: 'connector_capabilities.id', as: 'row_id' },
      { field: 'capabilities.id', as: 'capability_id' },
      'capabilities.label',
      'capabilities.blurb',
      'connector_capabilities.enabled',
      'connector_capabilities.version',
    ],
    filter: { eq: ['connector_capabilities.connector_id', { $context: 'connectorId' }] },
    sort: [{ field: 'capabilities.id', dir: 'asc' }],
    limit: 40,
  },
};

export const connectorProperties: CacheEntry = {
  fingerprint: 'connectors/properties',
  intent: 'Properties running one connector',
  shape: [{ property_id: '', name: '', city: '' }],
  dsl: {
    from: ['properties', 'property_connectors'],
    fields: [{ field: 'properties.id', as: 'property_id' }, 'properties.name', 'properties.city'],
    filter: { eq: ['property_connectors.connector_id', { $context: 'connectorId' }] },
    sort: [{ field: 'properties.name', dir: 'asc' }],
    limit: 20,
  },
};

export const propertiesList: CacheEntry = {
  fingerprint: 'properties/list',
  intent: 'Every property with the connector behind it and when it last resolved',
  shape: [{ property_id: '', name: '', city: '', accent: '', connector_id: '', connector_name: '', live_version: 0, synced_display: '' }],
  dsl: {
    from: ['properties', 'connectors'],
    fields: [
      { field: 'properties.id', as: 'property_id' },
      'properties.name',
      'properties.city',
      'properties.accent',
      { field: 'connectors.id', as: 'connector_id' },
      { field: 'connectors.name', as: 'connector_name' },
      'connectors.live_version',
      'properties.synced_at',
    ],
    sort: [{ field: 'properties.name', dir: 'asc' }],
    limit: 50,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        property_id: { $get: { from: { $var: 'r' }, path: ['property_id'] } },
        name: { $get: { from: { $var: 'r' }, path: ['name'] } },
        city: { $get: { from: { $var: 'r' }, path: ['city'] } },
        accent: { $get: { from: { $var: 'r' }, path: ['accent'] } },
        connector_id: { $get: { from: { $var: 'r' }, path: ['connector_id'] } },
        connector_name: { $get: { from: { $var: 'r' }, path: ['connector_name'] } },
        live_version: { $get: { from: { $var: 'r' }, path: ['live_version'] } },
        synced_display: stampText({ $get: { from: { $var: 'r' }, path: ['synced_at'] } }),
      },
    },
  },
};

export const propertyCapabilities: CacheEntry = {
  fingerprint: 'properties/capabilities',
  intent: 'Capabilities a property has enabled, with labels',
  shape: [{ row_id: '', capability_id: '', label: '', blurb: '', enabled: false }],
  dsl: {
    from: ['property_capabilities', 'capabilities'],
    fields: [
      { field: 'property_capabilities.id', as: 'row_id' },
      { field: 'capabilities.id', as: 'capability_id' },
      'capabilities.label',
      'capabilities.blurb',
      'property_capabilities.enabled',
    ],
    filter: { eq: ['property_capabilities.property_id', { $context: 'propertyId' }] },
    sort: [{ field: 'capabilities.id', dir: 'asc' }],
    limit: 40,
  },
};

export const connectorSetCapability: MutationEntry = {
  fingerprint: 'connectors/setCapability',
  intent: "Switch one capability of a connector's offer on or off",
  mutation: {
    op: 'update',
    table: 'connector_capabilities',
    set: { enabled: { $context: 'enabled' } },
    where: { eq: ['connector_capabilities.id', { $context: 'rowId' }] },
  },
};

export const propertyCapabilitySet: MutationEntry = {
  fingerprint: 'properties/setCapability',
  intent: 'Enable or disable one capability at one property',
  mutation: {
    op: 'update',
    table: 'property_capabilities',
    set: { enabled: { $context: 'enabled' } },
    where: { eq: ['property_capabilities.id', { $context: 'rowId' }] },
  },
};
