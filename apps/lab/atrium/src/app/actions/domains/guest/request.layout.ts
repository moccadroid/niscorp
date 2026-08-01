import type { LayoutNode } from '@niscorp/nova';

// The request form. The menu is `$.options`, loaded from the integration — there
// is no hardcoded list here. Each option carries its own label, icon and issue
// kind; choosing one fills the request, a note refines it, sending raises the
// ticket the desk sees.
export const requestLayout: LayoutNode = {
  if: '$.done',
  then: {
    component: 'Stack',
    props: { gap: 12, align: 'center' },
    children: [
      { component: 'Icon', props: { name: 'check', size: 28, color: 'accent' } },
      { component: 'Text', props: { serif: true, size: 'xl', align: 'center' }, children: 'The desk has it' },
      { component: 'Text', props: { size: 'sm', color: 'mute', align: 'center' }, children: 'You can follow it under “Your requests” on your home screen.' },
    ],
  },
  else: {
    component: 'Stack',
    props: { gap: 16 },
    children: [
      {
        if: '$.optionsLoading',
        then: { component: 'Skeleton', props: { h: 60, count: 2 } },
        else: {
          if: '$.options.length',
          then: {
            component: 'Grid',
            props: { min: 150, gap: 8 },
            children: {
              for: '$.options',
              as: 'o',
              key: 'option_id',
              do: { component: 'Tile', ref: 'choose', props: { title: '$o.label', blurb: '$o.detail', icon: '$o.icon', value: '$o', active: { $if: { $eq: ['$o.label', '$.summary'] }, $then: true, $else: false } } },
            },
          },
          else: { component: 'Empty', props: { icon: 'dot', title: 'Nothing to offer here', hint: 'This service is not available at this property right now.' } },
        },
      },
      { if: '$.summary', then: { component: 'Notice', props: { tone: 'accent', icon: 'check' }, children: 'Asking for: {{$.summary}}' }, else: '' },
      { component: 'Textarea', ref: 'detail', model: '$.detail', props: { placeholder: 'Anything else we should know?', rows: 3 } },
      // Dead until an option is chosen: the menu came from the integration and
      // IS the contract — free text alone has no category to land under.
      { component: 'Button', ref: 'send', props: { big: true, icon: 'send', disabled: { $if: '$.summary', $then: '$.working', $else: true } }, children: { if: '$.summary', then: 'Send to the desk', else: 'Choose something first' } },
    ],
  },
};
