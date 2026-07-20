import { createShell, type ActionDefinition, type ActionFragment } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/adapters/react';

// ONE FRAGMENT, MANY ACTIONS. The whole point of composition: define the chrome
// once, reuse it everywhere. Three different stat actions are each seeded
// `with: ['tile']` — identical frame, different bodies. Change `tile` once and
// all three move. (This is why a modal/list/panel becomes a fragment, not a
// copy-pasted layout.)

// The shared chrome. Its header reads `{{$.label}}` from whichever action it
// wraps, so each tile is still labelled by its own action's data.
const tile: ActionFragment = {
  kind: 'fragment',
  id: 'tile',
  layout: {
    component: 'Box',
    props: { border: true, radius: 10 },
    children: {
      component: 'Stack',
      props: { direction: 'column' },
      children: [
        {
          component: 'Box',
          props: { padding: 10, background: '#f1f5f9' },
          children: {
            component: 'Text',
            props: { size: 'sm', weight: 'bold', color: '#64748b' },
            children: '{{$.label}}',
          },
        },
        { component: 'Box', props: { padding: 16 }, children: { slot: 'body' } },
      ],
    },
  },
};

// Three plain stat actions — each just a number + caption. None know about `tile`.
const stat = (id: string, label: string, value: string, caption: string): ActionDefinition => ({
  id,
  data: { label },
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 4 },
    children: [
      { component: 'Text', props: { size: '2xl', weight: 'bold' }, children: value },
      { component: 'Text', props: { size: 'sm', color: '#64748b' }, children: caption },
    ],
  },
});

const statUsers = stat('stat-users', 'USERS', '1,204', 'active this week');
const statRevenue = stat('stat-revenue', 'REVENUE', '$89.4k', 'this month');
const statUptime = stat('stat-uptime', 'UPTIME', '99.95%', 'last 30 days');

// Each stat gets its own canvas, seeded composed with the SAME fragment. The
// default canvas layout lays them out in a row.
const shell = createShell({
  canvases: [
    { id: 'users', initial: { action: 'stat-users', with: ['tile'] } },
    { id: 'revenue', initial: { action: 'stat-revenue', with: ['tile'] } },
    { id: 'uptime', initial: { action: 'stat-uptime', with: ['tile'] } },
  ],
  actions: {
    'stat-users': statUsers,
    'stat-revenue': statRevenue,
    'stat-uptime': statUptime,
  },
  fragments: { tile },
});

export { shell };
export const Demo = () => <Nova.Shell shell={shell} />;
