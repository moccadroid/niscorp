import type { LayoutNode } from '@niscorp/nova';

export const LOOM_COLUMN = 'loom:column';

const slot = (canvasId: string): LayoutNode => ({ component: 'CanvasSlot', props: { canvasId } });

const titleOf = (formId: string): string => {
  const name = formId.replace(/^form:/, '');
  return name.charAt(0).toUpperCase() + name.slice(1);
};

const formPanel = (formId: string): LayoutNode => ({
  component: 'Box',
  props: { border: true, radius: 8, padding: 16 },
  children: [{ component: 'loom:group', props: { title: titleOf(formId) }, children: [slot(formId)] }],
});

const column = (grow: number, min: number, children: LayoutNode[]): LayoutNode => ({
  component: LOOM_COLUMN,
  props: { grow, min },
  children: [{ component: 'Stack', props: { direction: 'column', gap: 16 }, children }],
});

export const defaultCanvasLayout = (formIds: string[], viewIds: string[]): LayoutNode => ({
  component: 'Stack',
  props: { direction: 'row', gap: 16, align: 'start' },
  children: [
    ...(formIds.length > 0 ? [column(2, 420, formIds.map(formPanel))] : []),
    ...(viewIds.length > 0 ? [column(1, 340, viewIds.map(slot))] : []),
  ],
});
