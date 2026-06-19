import { type ReactNode } from 'react';
import { z } from 'zod';
import { createShell, type ActionDefinition, type ActionFragment } from '@niscorp/nova';
import { Nova, useNovaDispatch, type NovaComponent } from '@niscorp/nova/react';

// HOW MODALS WORK IN NOVA. A modal isn't a special concept — it's an ordinary
// action pushed onto a dedicated `modal` canvas, composed `with: ['modal']`. The
// fragment supplies ALL the chrome as data (backdrop, card, header, footer, the
// close/cancel wiring); the pushed action supplies only the body. Because it's a
// fragment, the chrome is defined once and reused by every modal, and an agent
// could author a new modal by emitting data — no code.
//
// The single thing that can't be data is positioning a dimmed layer over the
// page. That's the `Overlay` primitive below — the only React in this file.

// ── The one primitive: a dimmed backdrop that centers its child. Scoped to
// this demo pane (`position: absolute`, not `fixed`) so it doesn't cover the
// whole showroom. A backdrop click fires `ui:click close`, which the fragment's
// trigger turns into a pop.
const Overlay: NovaComponent = ({ children }: { children?: ReactNode }) => {
  const dispatch = useNovaDispatch();
  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dispatch({ type: 'ui:click', ref: 'close' });
      }}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
      }}
    >
      {children}
    </div>
  );
};
Overlay.meta = {
  description: 'A dimmed backdrop that centers its child. Backdrop click fires ui:click close.',
  propsSchema: z.object({}).strict(),
};

// ── The modal fragment: every bit of chrome, as serializable data. The pushed
// action's layout drops into `{ slot: 'body' }`; its data feeds `{{$.title}}`
// and `{{$.confirmLabel}}`. close/cancel pop; `confirm` is left to the action.
const modal: ActionFragment = {
  kind: 'fragment',
  id: 'modal',
  layout: {
    component: 'Overlay',
    children: {
      component: 'Box',
      props: { background: '#ffffff', radius: 12, border: true },
      children: {
        component: 'Stack',
        props: { direction: 'column' },
        children: [
          {
            component: 'Box',
            props: { padding: 16, background: '#f8fafc' },
            children: {
              component: 'Stack',
              props: { direction: 'row', justify: 'between', align: 'center' },
              children: [
                { component: 'Text', props: { weight: 'bold', size: 'lg' }, children: '{{$.title}}' },
                { component: 'Button', ref: 'close', props: { variant: 'ghost' }, children: '✕' },
              ],
            },
          },
          { component: 'Box', props: { padding: 16 }, children: { slot: 'body' } },
          {
            component: 'Box',
            props: { padding: 16, background: '#f8fafc' },
            children: {
              component: 'Stack',
              props: { direction: 'row', gap: 8, justify: 'end' },
              children: [
                { component: 'Button', ref: 'cancel', props: { variant: 'ghost' }, children: 'Cancel' },
                { component: 'Button', ref: 'confirm', props: { variant: 'primary' }, children: '{{$.confirmLabel}}' },
              ],
            },
          },
        ],
      },
    },
  },
  triggers: [
    { event: 'ui:click', ref: 'close', do: [{ pop: true }] },
    { event: 'ui:click', ref: 'cancel', do: [{ pop: true }] },
  ],
};

// ── The body: a plain form. It knows nothing about modals. Its `confirm` emits
// `created` (the page counts it) and pops itself.
const newContact: ActionDefinition = {
  id: 'new-contact',
  data: { title: 'New contact', confirmLabel: 'Create', draft: {} },
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 10 },
    children: [
      { component: 'Input', model: '$.draft.name', props: { placeholder: 'Name' } },
      { component: 'Input', model: '$.draft.email', props: { placeholder: 'Email' } },
    ],
  },
  triggers: [{ event: 'ui:click', ref: 'confirm', do: [{ emit: { channel: 'created' } }, { pop: true }] }],
};

// ── The page: opens the modal by pushing the form `with: ['modal']` onto the
// `modal` canvas, and counts how many were created.
const page: ActionDefinition = {
  id: 'page',
  data: { created: 0 },
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 12, padding: 24 },
    children: [
      { component: 'Text', props: { weight: 'bold', size: 'lg' }, children: 'Contacts' },
      { component: 'Text', props: { color: '#64748b', size: 'sm' }, children: 'Created so far: {{$.created}}' },
      { component: 'Button', ref: 'open', props: { variant: 'primary' }, children: 'New contact' },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'open', do: [{ push: { action: 'new-contact', canvas: 'modal', with: ['modal'] } }] },
    { message: 'created', do: [{ increment: 'created' }] },
  ],
};

// Two canvases: `page` is always visible; `modal` is empty until a modal action
// is pushed. The Overlay (absolute) renders on top of the page within the pane.
const shell = createShell({
  canvases: [
    { id: 'page', initial: 'page' },
    { id: 'modal' },
  ],
  actions: { page, 'new-contact': newContact },
  fragments: { modal },
  components: { Overlay },
});

export { shell };

// The relative, clipped wrapper scopes the modal's absolute Overlay to this pane.
export const Demo = () => (
  <div style={{ position: 'relative', minHeight: 340, overflow: 'hidden' }}>
    <Nova.Shell shell={shell} />
  </div>
);
