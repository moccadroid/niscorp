import type { LayoutNode } from '@niscorp/nova';

export const VALIDATION = 'loom:validation';

export const validationLayout: LayoutNode = {
  component: VALIDATION,
  props: { title: 'Validations', value: '$.value' },
};
