import { createContext, useContext, useState } from 'react';
import { createShell, type ActionDefinition, type LayoutNode } from '@niscorp/nova';
import { Nova, type SlotWrapper } from '@niscorp/nova/adapters/react';

// The SAME `slotWrapper` seam, used as a feature/auth gate instead of animation.
// Nova hands the wrapper the ActionDefinition; the wrapper decides — entirely
// app-side — whether to render the content or a fallback. The auth state is
// plain app state (React context), NOT Nova data, and the policy is keyed off
// `action.id` — never on the action schema or the layout the model writes.

// App-side auth state.
const AuthContext = createContext(false);

const GateSlot: SlotWrapper = ({ action, children }) => {
  const authed = useContext(AuthContext);
  const restricted = action?.id.startsWith('secret') === true; // app policy
  if (restricted && !authed) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', font: '500 14px system-ui' }}>
        🔒 Access denied — sign in to view “{action?.name ?? action?.id}”.
      </div>
    );
  }
  return <>{children}</>;
};

// ─── Actions ───
const card = (
  id: string,
  name: string,
  label: string,
  value: string,
  color: string,
): ActionDefinition => ({
  id,
  name,
  data: {},
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 4 },
    children: [
      { component: 'Text', props: { size: 'sm', color: '#6b7280' }, children: label },
      { component: 'Text', props: { size: '2xl', weight: 'bold', color }, children: value },
    ],
  },
});

const publicCard = card('public', 'Public stats', 'Signups (today)', '312', '#2563eb');
const secretCard = card('secret-revenue', 'Q3 Revenue', 'Revenue (confidential)', '$1.84M', '#059669');

// ─── Shell ───
const shellLayout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'row', gap: 16, padding: 16 },
  children: [
    {
      component: 'Box',
      props: { padding: 16, background: '#ffffff', border: true, radius: 8 },
      children: { component: 'CanvasSlot', props: { canvasId: 'public' } },
    },
    {
      component: 'Box',
      props: { padding: 16, background: '#f9fafb', border: true, radius: 8 },
      children: { component: 'CanvasSlot', props: { canvasId: 'secret' } },
    },
  ],
};

const shell = createShell({
  canvases: [
    { id: 'public', initial: 'public' },
    { id: 'secret', initial: 'secret-revenue' },
  ],
  canvasLayout: shellLayout,
  actions: { public: publicCard, 'secret-revenue': secretCard },
});

export { shell };
export const Demo = () => {
  const [authed, setAuthed] = useState(false);
  return (
    <AuthContext.Provider value={authed}>
      <div style={{ padding: 12, borderBottom: '1px solid #e5e7eb' }}>
        <button
          onClick={() => setAuthed((a) => !a)}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            background: authed ? '#dcfce7' : '#fff',
            cursor: 'pointer',
            font: '500 13px system-ui',
          }}
        >
          {authed ? '🔓 Signed in — click to sign out' : '🔐 Signed out — click to sign in'}
        </button>
      </div>
      <Nova.Shell shell={shell} slotWrapper={GateSlot} />
    </AuthContext.Provider>
  );
};
