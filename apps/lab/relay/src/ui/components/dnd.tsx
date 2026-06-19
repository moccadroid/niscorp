import { type ReactNode, useState } from 'react';
import { z } from 'zod';
import { useNovaDispatch, type NovaComponent } from '@niscorp/nova/react';
import { cx } from '../lib/cx';

// Drag-and-drop primitives. The browser drag mechanics stay here; only the
// SEMANTIC outcomes reach Nova — a `Draggable` emits `ui:click` on a plain click
// (so a card is still openable) and the dragged id rides in the native
// `dataTransfer`; a `DropZone` emits `ui:drop` carrying `{ id, toStage }` so a
// trigger can act. No DnD library, no raw DOM events plumbed into Nova.

// ─── Draggable ─────────────────────────────────────────────
const DraggableProps = z
  .object({
    value: z.unknown().optional().describe('The record id — drag payload (dataTransfer) and click payload.'),
    class: z.string().optional().describe('A CSS class from the kit (e.g. "rl-kanban__card").'),
  })
  .strict();

type DraggableP = z.infer<typeof DraggableProps> & { novaRef?: string; children?: ReactNode };

export const Draggable: NovaComponent<z.infer<typeof DraggableProps>> = ({ value, class: cls, novaRef, children }: DraggableP) => {
  const dispatch = useNovaDispatch();
  return (
    <div
      className={cls}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(value ?? ''));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => {
        if (novaRef !== undefined) dispatch({ type: 'ui:click', ref: novaRef, payload: value });
      }}
    >
      {children}
    </div>
  );
};
Draggable.meta = { description: 'A draggable + clickable wrapper. Click fires ui:click; drag carries `value` (the id) for a DropZone.', propsSchema: DraggableProps };

// ─── DropZone ──────────────────────────────────────────────
const DropZoneProps = z
  .object({
    value: z.unknown().optional().describe('Where a drop lands (e.g. the stage); sent as `toStage`.'),
    class: z.string().optional(),
  })
  .strict();

type DropZoneP = z.infer<typeof DropZoneProps> & { novaRef?: string; children?: ReactNode };

export const DropZone: NovaComponent<z.infer<typeof DropZoneProps>> = ({ value, class: cls, novaRef, children }: DropZoneP) => {
  const dispatch = useNovaDispatch();
  // Light up while a card is dragged over. A depth counter (enter++/leave--)
  // survives the dragenter/dragleave the nested cards fire, so the highlight
  // doesn't flicker as you move across them.
  const [depth, setDepth] = useState(0);
  return (
    <div
      className={cx(cls, depth > 0 && 'rl-dropover')}
      onDragEnter={(e) => {
        e.preventDefault();
        setDepth((d) => d + 1);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDragLeave={() => setDepth((d) => Math.max(0, d - 1))}
      onDrop={(e) => {
        e.preventDefault();
        setDepth(0);
        const id = e.dataTransfer.getData('text/plain');
        if (novaRef !== undefined) dispatch({ type: 'ui:drop', ref: novaRef, payload: { id, toStage: value } });
      }}
    >
      {children}
    </div>
  );
};
DropZone.meta = { description: 'A drop target. On drop, fires ui:drop with { id (the dragged value), toStage (this zone\'s value) }.', propsSchema: DropZoneProps };
