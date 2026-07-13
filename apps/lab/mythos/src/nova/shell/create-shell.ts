import { createLayoutStore, createShell } from '@niscorp/nova';
import type { ComponentRegistry, FetchFn, Shell, TransformFn } from '@niscorp/nova';
import { evaluate, validate } from '@niscorp/prism';
import type { JsonObject, JsonValue } from '@niscorp/prism';
import { toJson } from '../../lib/prism';
import { createAppRegistry } from '../../ui/registry';
import { topbar } from '../chrome/topbar.action';
import { todoList } from '../domains/todos/todo-list.action';
import { todoGarden } from '../domains/todos/todo-garden.action';
import { todoForm } from '../domains/todos/todo-form.action';
import { todoConfirmDelete } from '../domains/todos/todo-confirm-delete.action';
import { kitchenSink } from '../surfaces/kitchen-sink.action';
import { modalFrame } from '../fragments/modal-frame.fragment';

const isJsonObject = (value: JsonValue): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type AppShellDeps = { fetch: FetchFn; today: string };
export type AppShell = { shell: Shell; registry: ComponentRegistry };

export const createAppShell = ({ fetch, today }: AppShellDeps): AppShell => {
  const registry = createAppRegistry();

  // The Nova↔Prism socket (AGENTS rule 6). Nova never interprets transform
  // configs; Prism does, here. Ambient app context — the pinned reference
  // date — folds into the source at this seam: record sources (action data,
  // object replies) get `today` spread in; array/scalar replies are wrapped
  // as `{ reply, today }` so response transforms can reach both.
  const transform: TransformFn = (config, source) => {
    const parsed = validate(config);
    if (!parsed.ok) {
      const first = parsed.issues[0];
      throw new Error(`invalid transform config at ${first?.path.join('.') ?? 'root'}: ${first?.message ?? 'unknown'}`);
    }
    const json = toJson(source);
    const enriched: JsonObject = isJsonObject(json) ? { ...json, today } : { reply: json, today };
    return evaluate(parsed.data, enriched);
  };

  const shell = createShell({
    canvases: [
      { id: 'chrome', initial: 'topbar' },
      { id: 'main', initial: 'todo-list' },
      { id: 'overlay' },
    ],
    registry,
    layoutStore: createLayoutStore(),
    actions: {
      topbar,
      'todo-list': todoList,
      'todo-garden': todoGarden,
      'todo-form': todoForm,
      'todo-confirm-delete': todoConfirmDelete,
      'kitchen-sink': kitchenSink,
    },
    fragments: { 'modal-frame': modalFrame },
    transform,
    fetch,
    onError: (error) => console.error('[nova]', error),
  });

  return { shell, registry };
};
