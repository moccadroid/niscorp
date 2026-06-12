import type { LayoutNode } from '@niscorp/nova';

// The editor's default canvasLayout — a plain Nova layout. The forms are the main
// column (each in a titled, bordered panel); every other canvas (preview, JSON
// views) stacks in a side column (those already render their own panel). No Nova
// primitive can size a flex child, so the columns use Loom's `loom:column` (a Loom
// component, registered with the kit). A plugin can replace the whole arrangement
// with shell.setCanvasLayout.

export const LOOM_COLUMN = 'loom:column';

const slot = (canvasId: string): LayoutNode => ({ component: 'CanvasSlot', props: { canvasId } });

// `form:data` -> `Data`. A form canvas's title is its document name.
const titleOf = (formId: string): string => {
  const name = formId.replace(/^form:/, '');
  return name.charAt(0).toUpperCase() + name.slice(1);
};

// A form sits in a bordered panel headed by its document name.
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
