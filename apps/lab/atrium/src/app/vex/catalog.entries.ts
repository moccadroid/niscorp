import type { CacheEntry } from './index';
import { money } from '@atrium/app/prisms/format.prism';

export const requestOptions: CacheEntry = {
  fingerprint: 'catalog/requestOptions',
  intent: 'Options a property offers for a capability, from its connectors',
  shape: [{ option_id: '', label: '', detail: '', icon: '', kind: '', amount: 0, amount_display: '', price_line: '' }],
  dsl: {
    // Order matters: each entity must FK-join a previous one.
    from: ['request_options', 'connectors', 'property_connectors', 'connector_capabilities'],
    fields: [
      { field: 'request_options.id', as: 'option_id' },
      'request_options.label',
      'request_options.detail',
      'request_options.icon',
      'request_options.kind',
      'request_options.amount',
    ],
    filter: {
      and: [
        { eq: ['property_connectors.property_id', { $context: 'propertyId' }] },
        { eq: ['request_options.capability_id', { $context: 'capabilityId' }] },
        // A dotted string on the right is a field path: this compares field to
        // field.
        { eq: ['connector_capabilities.capability_id', 'request_options.capability_id'] },
        { eq: ['connector_capabilities.enabled', true] },
      ],
    },
    sort: [{ field: 'request_options.position', dir: 'asc' }],
    limit: 30,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        option_id: { $get: { from: { $var: 'r' }, path: ['option_id'] } },
        label: { $get: { from: { $var: 'r' }, path: ['label'] } },
        detail: { $get: { from: { $var: 'r' }, path: ['detail'] } },
        icon: { $get: { from: { $var: 'r' }, path: ['icon'] } },
        kind: { $get: { from: { $var: 'r' }, path: ['kind'] } },
        amount: { $get: { from: { $var: 'r' }, path: ['amount'] } },
        amount_display: {
          $case: {
            branches: [{ when: { $gt: [{ $get: { from: { $var: 'r' }, path: ['amount'] } }, 0] }, then: money({ $get: { from: { $var: 'r' }, path: ['amount'] } }) }],
            else: 'Included',
          },
        },
        price_line: {
          $case: {
            branches: [
              {
                when: { $gt: [{ $get: { from: { $var: 'r' }, path: ['amount'] } }, 0] },
                then: {
                  $join: {
                    parts: [{ $get: { from: { $var: 'r' }, path: ['detail'] } }, money({ $get: { from: { $var: 'r' }, path: ['amount'] } })],
                    sep: ' · ',
                  },
                },
              },
            ],
            else: { $get: { from: { $var: 'r' }, path: ['detail'] } },
          },
        },
      },
    },
  },
};
