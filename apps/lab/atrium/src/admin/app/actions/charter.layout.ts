import type { LayoutNode } from '@niscorp/nova';
import { panel, split, errorNotice, nothingChosen } from './panel';

export const charterLayout: LayoutNode = panel(
  'Charter',
  'Roles as compiled, principals as resolved — ring 1, the ceiling',
  split(
    // ── left: who wears what ──
    {
      component: 'Stack',
      props: { gap: 16 },
      children: [
        errorNotice,
        {
          component: 'Rows',
          props: {
            rows: '$.charter.principals',
            rowKey: 'id',
            rowRef: 'pick',
            loading: '$.loading',
            dense: true,
            empty: 'No principals.',
            columns: [
              { label: 'Principal', w: 2, cell: { kind: 'primary', key: 'name', subKey: 'who' } },
              { label: 'Holds', w: 1, cell: { kind: 'chip', key: 'count', toneKey: 'countTone' } },
            ],
          },
        },

        // The roles themselves, with what each compiles to. `perRole` comes out
        // of verifyCharter, which runs on every boot and every refresh and whose
        // only consumer until now was an error check.
        {
          component: 'Stack',
          props: { gap: 6 },
          children: [
            { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'Roles, and what each one compiles to:' },
            {
              component: 'Rows',
              props: {
                rows: '$.charter.roles',
                rowKey: 'role',
                dense: true,
                empty: 'No roles.',
                columns: [
                  { label: 'Role', w: 1, cell: { kind: 'primary', key: 'role', subKey: 'detail' } },
                  { label: 'Issues', w: 1, cell: { kind: 'text', key: 'issues' } },
                ],
              },
            },
          ],
        },

        // Warnings moss computes and never raises, because they are not errors.
        {
          if: '$.charter.warnings.length',
          then: {
            component: 'Stack',
            props: { gap: 6 },
            children: [
              { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'Warnings — computed at every boot, raised by nothing:' },
              {
                for: '$.charter.warnings',
                as: 'w',
                key: 'detail',
                do: {
                  component: 'Stack',
                  props: { gap: 1 },
                  children: [
                    { component: 'Badge', props: { tone: 'warn' }, children: '$w.rule' },
                    { component: 'Text', props: { size: 'xs', color: 'mute' }, children: '$w.detail' },
                  ],
                },
              },
            ],
          },
          else: { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'No charter warnings.' },
        },
      ],
    },

    // ── right: one principal's whole application ──
    {
      if: '$.selected.id',
      then: {
        component: 'Stack',
        props: { gap: 14 },
        children: [
          {
            component: 'Stack',
            props: { gap: 2 },
            children: [
              { component: 'Text', props: { serif: true, size: 'xl' }, children: '$.selected.name' },
              { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '{{$.selected.who}} · roles: {{$.selected.roles}} · {{$.selected.detail}}' },
              { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'The ceiling, not the screen: what is PLACED also depends on the estate. Tap an action to see who else may hold it.' },
            ],
          },
          {
            component: 'Rows',
            props: {
              rows: '$.actions',
              rowKey: 'id',
              rowRef: 'probe',
              dense: true,
              empty: 'Nothing at all — this principal has no application.',
              columns: [
                { label: 'Action', w: 3, cell: { kind: 'primary', key: 'id', subKey: 'title' } },
                { label: 'Shipped by', w: 1, cell: { kind: 'chip', key: 'source', toneKey: 'tone' } },
              ],
            },
          },
          {
            if: '$.probe.id',
            then: {
              component: 'Box',
              props: { px: 14, py: 12, bg: 'sunk', radius: 10 },
              children: {
                component: 'Stack',
                props: { gap: 6 },
                children: [
                  { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'Every principal who may hold {{$.probe.id}}:' },
                  {
                    component: 'Row',
                    props: { gap: 6, wrap: true },
                    children: {
                      for: '$.holders',
                      as: 'h',
                      key: 'id',
                      do: { component: 'Badge', props: { tone: 'neutral' }, children: '{{$h.name}} · {{$h.who}}' },
                    },
                  },
                ],
              },
            },
            else: '',
          },
        ],
      },
      else: nothingChosen('Pick a principal to see the application the charter resolves for them.'),
    },
  ),
);
