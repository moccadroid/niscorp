import { type ReactNode, useState } from 'react';
import { z } from 'zod';
import { useNovaDispatch, type NovaComponent } from '@niscorp/nova/adapters/react';
import { cx } from '../lib/cx';

// Kanban drag-and-drop. The browser drag mechanics stay here; only the
// SEMANTIC outcomes reach Nova — a `KanbanCard` emits `ui:click` on a plain
// click (so a card is still openable) and the dragged id rides in the native
// `dataTransfer`; `KanbanCards` (a column's drop zone) emits `ui:drop`
// carrying `{ id, toStage }` so a trigger can act. The kit card/zone chrome
// is applied internally — layouts declare no classes.

// ─── KanbanCard ────────────────────────────────────────────
const KanbanCardProps = z
  .object({
    value: z.unknown().optional().describe('The record id — drag payload (dataTransfer) and click payload.'),
  })
  .strict();

type KanbanCardP = z.infer<typeof KanbanCardProps> & { novaRef?: string; children?: ReactNode };

export const KanbanCard: NovaComponent<z.infer<typeof KanbanCardProps>> = ({ value, novaRef, children }: KanbanCardP) => {
  const dispatch = useNovaDispatch();
  return (
    <div
      className="rl-kanban__card"
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
KanbanCard.meta = { description: 'A draggable + clickable kanban card. Click fires ui:click; drag carries `value` (the id) for a KanbanCards zone.', propsSchema: KanbanCardProps };

// ─── KanbanCards ───────────────────────────────────────────
const KanbanCardsProps = z
  .object({
    value: z.unknown().optional().describe('Where a drop lands (e.g. the stage); sent as `toStage`.'),
  })
  .strict();

type KanbanCardsP = z.infer<typeof KanbanCardsProps> & { novaRef?: string; children?: ReactNode };

export const KanbanCards: NovaComponent<z.infer<typeof KanbanCardsProps>> = ({ value, novaRef, children }: KanbanCardsP) => {
  const dispatch = useNovaDispatch();
  // Light up while a card is dragged over. A depth counter (enter++/leave--)
  // survives the dragenter/dragleave the nested cards fire, so the highlight
  // doesn't flicker as you move across them.
  const [depth, setDepth] = useState(0);
  return (
    <div
      className={cx('rl-kanban__cards', depth > 0 && 'rl-dropover')}
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
KanbanCards.meta = { description: 'A kanban column\'s card list + drop target. On drop, fires ui:drop with { id (the dragged value), toStage (this zone\'s value) }.', propsSchema: KanbanCardsProps };
