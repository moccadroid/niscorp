import type { CacheEntry } from './index';
import { reasonText, reasonTone } from '@atrium/app/prisms/format.prism';

// ═══════════════════════════════════════════════════════════
// The resolved surface — the spine of the whole application.
//
// `property_slots` is written by the connector sync and by nothing else. These
// two reads are how every shell learns what it holds. There is no other path:
// no layout tests a capability, no action asks a PMS what it supports, and the
// concierge picks its candidates from exactly this list, which is why it cannot
// offer a service the property does not run.
// ═══════════════════════════════════════════════════════════

// What is placed on one audience's shell, right now, at this property.
//
// Four factors decide, and three of them are already baked into the row: the
// connector's live version and the property's switches produced `live`, the
// charter decided the action id exists for this role at all, and the stay state
// is the one filter left to apply here ('any' slots always apply). `keywords`
// rides along so the concierge scores against the SAME resolved list the shell
// renders — one source of truth for "what can happen".
// WHICH SURFACE ANSWERS A CAPABILITY HERE. A core list can hold a row it cannot
// act on — a guest's upgrade ask lives in `stay_requests`, but the screen that
// answers it ships with a connector, and core may not name a vendor action id.
// So it asks: whatever is live at this property for these capabilities, what is
// it called. A property running neither connector gets an empty answer and the
// row stays a row.
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
      // Which canvas this belongs on — the composition fans out by it.
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

// The staff MENU: the same resolution, narrowed to what opens on the working
// column. `surface/live` answers "everything placed for this audience", which
// includes the stay-scoped surfaces held back for a guest workspace — a menu
// listing those would offer a clerk a card that needs a guest nobody has
// chosen. One filter, so the menu is still nothing but resolved rows.
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
  // ONE ROW PER SURFACE. A surface serving two capabilities holds two slots —
  // Approvals answers both `upgrade.offer` and `checkout.late` — and a menu
  // listing it twice is just wrong. Projecting to the four fields the menu
  // actually shows makes those rows identical, so `$unique` collapses them; the
  // SQL sort already put them in position order, which the mapping preserves.
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

// DELETED: `surface/staffSlots`, which fed the staff chrome's "More" strip —
// the ext-only half of a nav bar whose other half was eleven authored edges.
// The crew surface is composed from `surface/live` now, exactly like a
// guest's, so bundle and core surfaces arrive by one path instead of two.

// Every slot at a property, live or dark, WITH the reason. The ops manager's
// "what this property runs" pane and the vendor's rollout view both read this.
//
// `surface_slots.capability_id` is nullable, so vex LEFT JOINs `capabilities` —
// an unconditional slot keeps its row instead of vanishing. `reason` was decided
// by the resolver; the mapping only spells it in words.
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

// The same matrix, scoped to what a GUEST would get — the vendor console's
// before/after view when a version is bumped. Same table, narrower question.
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
