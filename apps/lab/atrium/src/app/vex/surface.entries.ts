import type { CacheEntry } from './index';
import { reasonText, reasonTone } from '@atrium/app/prisms/format.prism';

export const surfaceServing: CacheEntry = {
  fingerprint: 'surface/serving',
  intent: 'The live desk action that serves one of a set of capabilities at a property',
  shape: { action_id: '' },
  dsl: {
    from: ['property_slots', 'surface_slots'],
    fields: ['surface_slots.action_id'],
    filter: {
      and: [
        { eq: ['property_slots.property_id', { $context: 'propertyId' }] },
        { eq: ['property_slots.live', true] },
        { eq: ['surface_slots.audience', 'desk'] },
        { in: ['surface_slots.capability_id', { $context: 'capabilities' }] },
      ],
    },
    sort: [{ field: 'surface_slots.position', dir: 'asc' }],
    limit: 1,
  },
  mapping: {
    $with: {
      let: { r: { $ref: '$.result' } },
      value: { action_id: { $get: { from: { $var: 'r' }, path: ['action_id'], fallback: { $const: '' } } } },
    },
  },
};

export const surfaceLive: CacheEntry = {
  fingerprint: 'surface/live',
  intent: 'Resolved live slots for an audience at a property, filtered by stay state',
  shape: [{ slot_id: '', action_id: '', title: '', blurb: '', icon: '', capability_id: '', keywords: '', canvas: '', position: 0 }],
  dsl: {
    from: ['property_slots', 'surface_slots'],
    fields: [
      { field: 'surface_slots.id', as: 'slot_id' },
      'surface_slots.action_id',
      'surface_slots.title',
      'surface_slots.blurb',
      'surface_slots.icon',
      'surface_slots.capability_id',
      'surface_slots.keywords',
      'surface_slots.canvas',
      'surface_slots.position',
    ],
    filter: {
      and: [
        { eq: ['property_slots.property_id', { $context: 'propertyId' }] },
        { eq: ['property_slots.live', true] },
        { eq: ['surface_slots.audience', { $context: 'audience' }] },
        { or: [{ eq: ['surface_slots.stay_state', 'any'] }, { eq: ['surface_slots.stay_state', { $context: 'stayState' }] }] },
      ],
    },
    sort: [{ field: 'surface_slots.position', dir: 'asc' }],
    limit: 50,
  },
};

export const surfaceMenu: CacheEntry = {
  fingerprint: 'surface/menu',
  intent: 'Resolved slots an audience can open on the working column at a property',
  shape: [{ action_id: '', title: '', blurb: '', icon: '' }],
  dsl: {
    from: ['property_slots', 'surface_slots'],
    fields: [
      'surface_slots.action_id',
      'surface_slots.title',
      'surface_slots.blurb',
      'surface_slots.icon',
      'surface_slots.position',
    ],
    filter: {
      and: [
        { eq: ['property_slots.property_id', { $context: 'propertyId' }] },
        { eq: ['property_slots.live', true] },
        { eq: ['surface_slots.audience', { $context: 'audience' }] },
        { eq: ['surface_slots.canvas', 'work'] },
      ],
    },
    sort: [{ field: 'surface_slots.position', dir: 'asc' }],
    limit: 50,
  },
  // A surface serving two capabilities holds two slots. Projected to these
  // four fields the rows are identical, so `$unique` collapses them.
  mapping: {
    $unique: {
      $map: {
        over: { $ref: '$.result' },
        as: 'r',
        body: {
          action_id: { $get: { from: { $var: 'r' }, path: ['action_id'] } },
          title: { $get: { from: { $var: 'r' }, path: ['title'] } },
          blurb: { $get: { from: { $var: 'r' }, path: ['blurb'] } },
          icon: { $get: { from: { $var: 'r' }, path: ['icon'] } },
        },
      },
    },
  },
};

// `surface_slots.capability_id` is nullable, so vex LEFT JOINs `capabilities`:
// a slot with no capability keeps its row.
export const surfaceMatrix: CacheEntry = {
  fingerprint: 'surface/matrix',
  intent: 'Every slot at a property with its live flag, capability and the reason it is dark',
  shape: [{ slot_id: '', title: '', blurb: '', audience: '', capability_id: '', capability_label: '', live: false, reason: '', reason_text: '', reason_tone: '', position: 0 }],
  dsl: {
    from: ['property_slots', 'surface_slots', 'capabilities'],
    fields: [
      { field: 'surface_slots.id', as: 'slot_id' },
      'surface_slots.title',
      'surface_slots.blurb',
      'surface_slots.audience',
      'surface_slots.capability_id',
      { field: 'capabilities.label', as: 'capability_label' },
      'property_slots.live',
      'property_slots.reason',
      'surface_slots.position',
    ],
    filter: { eq: ['property_slots.property_id', { $context: 'propertyId' }] },
    sort: [
      { field: 'surface_slots.audience', dir: 'asc' },
      { field: 'surface_slots.position', dir: 'asc' },
    ],
    limit: 100,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        slot_id: { $get: { from: { $var: 'r' }, path: ['slot_id'] } },
        title: { $get: { from: { $var: 'r' }, path: ['title'] } },
        blurb: { $get: { from: { $var: 'r' }, path: ['blurb'] } },
        audience: { $get: { from: { $var: 'r' }, path: ['audience'] } },
        capability_id: { $get: { from: { $var: 'r' }, path: ['capability_id'] } },
        capability_label: { $get: { from: { $var: 'r' }, path: ['capability_label'] } },
        live: { $get: { from: { $var: 'r' }, path: ['live'] } },
        reason: { $get: { from: { $var: 'r' }, path: ['reason'] } },
        reason_text: reasonText({ $get: { from: { $var: 'r' }, path: ['reason'] } }),
        reason_tone: reasonTone({ $get: { from: { $var: 'r' }, path: ['reason'] } }),
        position: { $get: { from: { $var: 'r' }, path: ['position'] } },
      },
    },
  },
};

export const surfaceGuestMatrix: CacheEntry = {
  fingerprint: 'surface/guestMatrix',
  intent: 'Guest-facing slots at a property with their live flag and reason',
  shape: [{ slot_id: '', title: '', capability_label: '', live: false, reason_text: '', reason_tone: '' }],
  dsl: {
    from: ['property_slots', 'surface_slots', 'capabilities'],
    fields: [
      { field: 'surface_slots.id', as: 'slot_id' },
      'surface_slots.title',
      { field: 'capabilities.label', as: 'capability_label' },
      'property_slots.live',
      'property_slots.reason',
    ],
    filter: {
      and: [{ eq: ['property_slots.property_id', { $context: 'propertyId' }] }, { eq: ['surface_slots.audience', 'guest'] }],
    },
    sort: [{ field: 'surface_slots.position', dir: 'asc' }],
    limit: 50,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        slot_id: { $get: { from: { $var: 'r' }, path: ['slot_id'] } },
        title: { $get: { from: { $var: 'r' }, path: ['title'] } },
        capability_label: { $get: { from: { $var: 'r' }, path: ['capability_label'] } },
        live: { $get: { from: { $var: 'r' }, path: ['live'] } },
        reason_text: reasonText({ $get: { from: { $var: 'r' }, path: ['reason'] } }),
        reason_tone: reasonTone({ $get: { from: { $var: 'r' }, path: ['reason'] } }),
      },
    },
  },
};
