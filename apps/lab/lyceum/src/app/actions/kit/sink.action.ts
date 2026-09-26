import type { ActionDefinition } from '@niscorp/nova';
import { sinkLayout } from './sink.layout';

// THE KITCHEN SINK — every piece of the look on one screen: the four inks,
// the five marks, the four sigils, the type registers, figures, code, rows, a
// bar and actions. Held only by the `kit` principal (dev: /dev/as/kit). The
// look is locked here before a feature leans on it.
export const sinkAction: ActionDefinition = {
  id: 'kit.sink',
  title: 'Kitchen sink',
  data: {
    rows: [
      { id: '1', sigil: 'triangle', name: 'Ada Moreau', department: 'Records', fp: 'members/me' },
      { id: '2', sigil: 'circle', name: 'Ben Okafor', department: 'Forms', fp: 'members/register' },
      { id: '3', sigil: 'cross', name: 'Cleo Lind', department: 'Inquiries', fp: 'deck/current' },
      { id: '4', sigil: null, name: 'Dev Rao', department: null, fp: 'members/counts' },
    ],
    code: "{ component: 'Cell',\n  props: { area: 'department',\n           mark: '$.me.department_mark' } }",
  },
  layout: sinkLayout,
  triggers: [],
};
