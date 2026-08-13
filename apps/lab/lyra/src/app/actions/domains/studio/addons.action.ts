import { z } from 'zod';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { addonInstall, addonUninstall, addonsInstalled, addonsList } from '@lyra/app/vex/addon.entries';

const listPrism = { fingerprint: addonsList.fingerprint, context: {} };
const installedPrism = { fingerprint: addonsInstalled.fingerprint, context: {} };
const installPrism = { fingerprint: addonInstall.fingerprint, context: { integrationId: { $ref: '$.pendingId' } } };
const uninstallPrism = { fingerprint: addonUninstall.fingerprint, context: { integrationId: { $ref: '$.pendingId' } } };

// The store's tiles: `offered` (every approved integration) joined with
// `installed` (this studio's rows) — the stitch that used to be a server
// function, now a derivation over data the screen already holds. Both halves
// of `has_settings` on purpose: the pack shipped a settings screen AND this
// studio has it on — a store must never open functionality a studio has not
// bought. The "Adds …" sentence rides as a fact rather than a clipped table
// cell, and a bundle that shipped no meta still gets a tile named by its id.
const stitchRows = {
  $prism: {
    $map: {
      over: { $ref: '$.offered' },
      as: 'a',
      body: {
        $with: {
          let: {
            id: { $get: { from: { $var: 'a' }, path: ['integration_id'] } },
            title: { $get: { from: { $var: 'a' }, path: ['title'] } },
            settings: { $get: { from: { $var: 'a' }, path: ['settings_action'] } },
            adds: { $get: { from: { $var: 'a' }, path: ['adds'] } },
            on: {
              $gt: [
                {
                  $length: {
                    $filter: {
                      over: { $ref: '$.installed' },
                      as: 'i',
                      when: { $eq: [{ $get: { from: { $var: 'i' }, path: ['integration_id'] } }, { $get: { from: { $var: 'a' }, path: ['integration_id'] } }] },
                    },
                  },
                },
                0,
              ],
            },
          },
          value: {
            integration_id: { $var: 'id' },
            name: { $case: { branches: [{ when: { $eq: [{ $var: 'title' }, ''] }, then: { $var: 'id' } }], else: { $var: 'title' } } },
            tagline: { $get: { from: { $var: 'a' }, path: ['tagline'] } },
            description: { $get: { from: { $var: 'a' }, path: ['description'] } },
            adds: { $var: 'adds' },
            settings_action: { $var: 'settings' },
            installed: { $var: 'on' },
            has_settings: { $and: [{ $var: 'on' }, { $neq: [{ $var: 'settings' }, ''] }] },
            state_label: { $case: { branches: [{ when: { $var: 'on' }, then: 'On' }], else: 'Available' } },
            state_tone: { $case: { branches: [{ when: { $var: 'on' }, then: 'good' }], else: 'neutral' } },
            facts: { $case: { branches: [{ when: { $eq: [{ $var: 'adds' }, ''] }, then: [] }], else: [{ label: 'Adds', value: { $var: 'adds' } }] } },
          },
        },
      },
    },
  },
};

const layout: LayoutNode = {
  component: 'Stack',
  props: { gap: 22 },
  children: [
    { component: 'Hero', props: { title: 'Add-ons', lead: 'What this studio can turn on. Screens land where they belong — a store, not a menu.' } },
    { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },
    // Tiles, because prose in a spreadsheet cell clips at the ellipsis whatever
    // width you give it.
    {
      component: 'Cards',
      props: {
        rows: '$.rows',
        loading: '$.loading',
        rowKey: 'integration_id',
        titleKey: 'name',
        subtitleKey: 'tagline',
        bodyKey: 'description',
        badgeKey: 'state_label',
        badgeToneKey: 'state_tone',
        factsKey: 'facts',
        icon: 'addons',
        columns: 340,
        empty: 'Nothing on offer yet.',
        emptyHint: 'Add-ons appear here once an operator has approved them for this deployment.',
        emptyIcon: 'addons',
        actions: [
          { label: 'Install', ref: 'install', variant: 'outline', icon: 'plus', hideKey: 'installed' },
          { label: 'Settings', ref: 'openSettings', variant: 'ghost', icon: 'settings', showKey: 'has_settings' },
          { label: 'Remove', ref: 'uninstall', variant: 'ghost', showKey: 'installed' },
        ],
      },
    },
  ],
};

export const addonsAction: ActionDefinition = {
  id: 'studio.addons',
  title: 'Add-ons',
  data: { rows: [], offered: [], installed: [], loading: true, error: '', pendingId: '' },
  layout,
  endpoints: {
    // A failed read says so and stops pretending to load — otherwise it is a
    // refusal underneath and grey bars on top, forever.
    offered: { url: '/api/studio/vex', method: 'POST', request: listPrism, target: 'offered', errorTarget: 'error' },
    installed: { url: '/api/studio/vex', method: 'POST', request: installedPrism, target: 'installed', errorTarget: 'error' },
    // Install is idempotent from every starting state — fresh, removed,
    // already on — the DB arbitrates via ON CONFLICT (see addon.entries.ts).
    // The server-side world refresh rides `onMutation` in app.ts: it fires on
    // the WRITE landing, whoever caused it, not on this screen remembering to.
    enable: { url: '/api/studio/vex', method: 'POST', request: installPrism, errorTarget: 'error' },
    disable: { url: '/api/studio/vex', method: 'POST', request: uninstallPrism, errorTarget: 'error' },
  },
  lifecycle: {
    mount: [
      { call: 'offered', onError: [{ set: 'loading', value: false }] },
      { call: 'installed', onSuccess: [{ set: 'rows', value: stitchRows }, { set: 'loading', value: false }], onError: [{ set: 'loading', value: false }] },
    ],
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'install',
      do: [
        { set: 'pendingId', value: '@event.payload.integration_id' },
        { set: 'error', value: '' },
        { call: 'enable', onSuccess: [{ emit: { channel: 'addons-changed' } }] },
      ],
    },
    {
      event: 'ui:click',
      ref: 'uninstall',
      do: [
        { set: 'pendingId', value: '@event.payload.integration_id' },
        { set: 'error', value: '' },
        { call: 'disable', onSuccess: [{ emit: { channel: 'addons-changed' } }] },
      ],
    },
    {
      event: 'ui:click',
      ref: 'openSettings',
      do: [{ push: { action: '@event.payload.settings_action', canvas: 'sheet', with: ['sheet'] } }],
    },
    // The world refresh happened server-side when the write landed; these
    // re-reads are only the store repainting its own list.
    {
      message: 'addons-changed',
      do: [{ call: 'offered' }, { call: 'installed', onSuccess: [{ set: 'rows', value: stitchRows }] }],
    },
  ],
};

export const addonsInputSchema = z.toJSONSchema(z.object({}));
