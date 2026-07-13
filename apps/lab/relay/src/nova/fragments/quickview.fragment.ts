import type { ActionFragment } from '@niscorp/nova';

// The quickview chrome — the same dialog as the modal, but its header carries an
// "Open fullscreen" button beside the close. Any action opened from the search
// is composed `with: ['quickview']` and pushed onto the `modal` canvas, so it
// shows as a peek. "Open fullscreen" navigates the main canvas to that action,
// carrying the data the quickview already loaded (the push `input` below pulls
// `$.rows` / `$.view` / … from the quickviewed action's own data), so the
// fullscreen view shows immediately. `fullscreenAction` / `quickviewTitle` are
// passed at the push.
export const quickviewFragment: ActionFragment = {
  kind: 'fragment',
  id: 'quickview',
  layout: {
    component: 'Overlay',
    children: {
      component: 'Dialog',
      props: { size: 'wide' },
      children: [
        {
          component: 'DialogHead',
          children: [
            {
              component: 'DialogTitle',
              children: '$.quickviewTitle',
            },
            {
              component: 'Row',
              props: { gap: 6, align: 'center' },
              children: [
                {
                  component: 'Button',
                  ref: 'fullscreen',
                  props: { variant: 'default', size: 'sm' },
                  children: 'Open fullscreen',
                },
                {
                  component: 'Button',
                  ref: 'close',
                  props: { variant: 'ghost', size: 'sm' },
                  children: '✕',
                },
              ],
            },
          ],
        },
        {
          component: 'DialogBody',
          children: { slot: 'body' },
        },
      ],
    },
  },
  triggers: [
    { event: 'ui:click', ref: 'close', do: [{ pop: true }] },
    // Navigate the main canvas to the action, carrying whatever data the
    // quickview loaded. `loading: false` so it shows at once; the mount re-query
    // is a cached refresh. pop is last — it self-closes this (modal) action.
    {
      event: 'ui:click',
      ref: 'fullscreen',
      do: [
        {
          resetTo: {
            action: '{{$.fullscreenAction}}',
            canvas: 'main',
            input: {
              rows: '$.rows',
              dash: '$.dash',
              settings: '$.settings',
              queryId: '$.queryId',
              context: '$.context',
              highlight_id: '$.highlight_id',
              loading: false,
            },
          },
        },
        { emit: { channel: 'screen-{{$.fullscreenAction}}' } },
        { pop: true },
      ],
    },
  ],
};
