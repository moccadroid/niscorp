import type { CacheEntry } from './index';
import { money } from '@atrium/app/prisms/format.prism';

// The request catalogue — the options a request action shows, resolved from the
// property's connectors. This is what makes the spa/housekeeping/report/minibar
// menus DB-backed rather than hardcoded: each connector ships its own list, and
// a property gets whichever its connectors currently offer.
//
// A property runs more than one connector, and a capability is served by exactly
// one of them (spa → Mews, report categories → HotelFix), so the join to
// property_connectors plus the enabled-capability filter lands on the right
// catalogue without the app knowing which system it came from.
export const requestOptions: CacheEntry = {
  fingerprint: 'catalog/requestOptions',
  intent: 'Options a property offers for a capability, from its connectors',
  shape: [{ option_id: '', label: '', detail: '', icon: '', kind: '', amount: 0, amount_display: '', price_line: '' }],
  dsl: {
    // Order matters for join planning: each entity must FK-join a PREVIOUS
    // one. request_options → connectors (FK), then connectors →
    // property_connectors and connectors → connector_capabilities.
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
        // Only what the connector has SWITCHED ON offers a menu — disable the
        // capability at the vendor console and the options leave with it. A
        // dotted string on the right is a field path, so these are
        // field-to-field comparisons, not literals.
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
        // Priced options say so; free ones stay quiet. The layout never does
        // arithmetic or currency — both lines arrive formatted.
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
