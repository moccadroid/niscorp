import type { LayoutNode, Step } from '@niscorp/nova';

const titleOf = (preview: LayoutNode): string => {
  const title = (preview as { props?: { title?: unknown } }).props?.title;
  return typeof title === 'string' ? title : '';
};

export const previewable = (preview: LayoutNode, full: LayoutNode): LayoutNode => ({
  if: '$.expanded',
  then: {
    // On a sheet the overlay already frames and titles the surface, so it
    // renders bare.
    if: '$.sheetTitle',
    then: full,
    else: {
      component: 'Card',
      props: {},
      children: {
        component: 'Stack',
        props: { gap: 12 },
        children:
          titleOf(preview) === ''
            ?
              [{ component: 'Row', props: { justify: 'end' }, children: [{ component: 'Button', ref: 'collapse', props: { variant: 'plain', icon: 'chevron-up' }, children: 'Collapse' }] }, full]
            : [
                {
                  component: 'Row',
                  props: { justify: 'between', align: 'center', gap: 10 },
                  children: [
                    { component: 'Text', props: { serif: true, size: 'lg' }, children: titleOf(preview) },
                    { component: 'Button', ref: 'collapse', props: { variant: 'plain', icon: 'chevron-up' }, children: 'Collapse' },
                  ],
                },
                { component: 'Rule', props: {} },
                full,
              ],
      },
    },
  },
  else: preview,
});

// `reload` re-runs the action's mount hook. A composed canvas keeps every card
// live and suspends nothing, so a card opened long after it was seeded would
// otherwise show the figures it loaded then.
export const previewTriggers: { event: string; ref: string; do: Step[] }[] = [
  { event: 'ui:click', ref: 'expand', do: [{ set: 'expanded', value: true }, { reload: true }] },
  { event: 'ui:click', ref: 'collapse', do: [{ set: 'expanded', value: false }] },
];

export const crewCard = (title: string, icon: string, line: unknown): LayoutNode => ({
  component: 'Tile',
  ref: 'expand',
  props: { title, icon, blurb: line },
});
