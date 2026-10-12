import { shallowRef, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue';
import type { ActionStatus, PublicActionRuntime } from '@action';
import type { RenderNode } from '@layout';
import type { CanvasState, Shell, StateSnapshot } from '@shell';
import type { Phrasebook } from '../../../i18n/phrases';
import { useShellSource } from './context';

type Unsubscribe = () => void;

type Binding<T, K> = {
  key: () => K;
  read: (shell: Shell, key: K) => T;
  subscribe: (shell: Shell, key: K, notify: () => void) => Unsubscribe;
};

const bindShell = <T, K>(binding: Binding<T, K>): Readonly<Ref<T>> => {
  const source = useShellSource();
  const value = shallowRef<T>(binding.read(source.shell, binding.key()));
  watch(
    (): [Shell, K] => [source.shell, binding.key()],
    ([shell, key], _previous, onCleanup) => {
      const refresh = (): void => {
        value.value = binding.read(shell, key);
      };
      refresh();
      onCleanup(binding.subscribe(shell, key, refresh));
    },
    { immediate: true },
  );
  return value;
};

const EMPTY: RenderNode[] = [];

const subscribeState = (shell: Shell, _key: unknown, notify: () => void): Unsubscribe => shell.onStateChange(() => notify());

export const useCanvasRenderTree = (canvasId: MaybeRefOrGetter<string | undefined>): Readonly<Ref<RenderNode[]>> =>
  bindShell({
    key: () => toValue(canvasId),
    read: (shell, id) => (id === undefined || id === '' ? EMPTY : shell.getCanvasRenderTree(id)),
    subscribe: subscribeState,
  });

export const useShellRenderTree = (): Readonly<Ref<RenderNode[]>> =>
  bindShell({ key: () => undefined, read: (shell) => shell.getShellRenderTree(), subscribe: subscribeState });

export const useShellState = (): Readonly<Ref<StateSnapshot>> =>
  bindShell({ key: () => undefined, read: (shell) => shell.getState(), subscribe: subscribeState });

export const useCanvas = (canvasId: MaybeRefOrGetter<string>): Readonly<Ref<CanvasState>> =>
  bindShell({
    key: () => toValue(canvasId),
    read: (shell, id) => shell.getCanvasState(id),
    subscribe: (shell, id, notify) => shell.onCanvasChange(id, () => notify()),
  });

const subscribeRuntime =
  (listen: (runtime: PublicActionRuntime, notify: () => void) => Unsubscribe) =>
  (shell: Shell, instanceId: string, notify: () => void): Unsubscribe => {
    let current = shell.getRuntime(instanceId);
    let offRuntime = current === undefined ? undefined : listen(current, notify);
    const offState = shell.onStateChange(() => {
      const next = shell.getRuntime(instanceId);
      if (next !== current) {
        offRuntime?.();
        current = next;
        offRuntime = current === undefined ? undefined : listen(current, notify);
      }
      notify();
    });
    return () => {
      offRuntime?.();
      offState();
    };
  };

const onData = subscribeRuntime((runtime, notify) => runtime.onDataChange(() => notify()));
const onStatus = subscribeRuntime((runtime, notify) => runtime.onStatusChange(() => notify()));

export const useActionData = (instanceId: MaybeRefOrGetter<string>): Readonly<Ref<Record<string, unknown> | undefined>> =>
  bindShell({ key: () => toValue(instanceId), read: (shell, id) => shell.getRuntime(id)?.getData(), subscribe: onData });

export const useActionStatus = (instanceId: MaybeRefOrGetter<string>): Readonly<Ref<ActionStatus | undefined>> =>
  bindShell({ key: () => toValue(instanceId), read: (shell, id) => shell.getRuntime(id)?.instance.status, subscribe: onStatus });

// Two inputs: the runtime's data and the shell's phrases, which `setPhrases`
// changes without touching any data. It listens to both and caches on both, so
// an unrelated state change hands back the same tree.
export const useRenderTree = (instanceId: MaybeRefOrGetter<string>): Readonly<Ref<RenderNode[]>> => {
  let cache: { data: Record<string, unknown>; phrases: Phrasebook | undefined; tree: RenderNode[] } | undefined;
  return bindShell({
    key: () => toValue(instanceId),
    read: (shell, id) => {
      const runtime = shell.getRuntime(id);
      if (runtime === undefined) {
        cache = undefined;
        return EMPTY;
      }
      const data = runtime.getData();
      const phrases = shell.getPhrases();
      if (cache !== undefined && cache.data === data && cache.phrases === phrases) return cache.tree;
      const tree = runtime.render();
      cache = { data, phrases, tree };
      return tree;
    },
    subscribe: onData,
  });
};
