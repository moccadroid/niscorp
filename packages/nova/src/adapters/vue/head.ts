import { defineComponent, inject, onMounted, provide, shallowRef, watch, type InjectionKey, type ShallowRef } from 'vue';
import type { Shell } from '@shell';
import { createShellHead, type ShellHead } from '../../document/shell-head';

// Everything here starts in `onMounted`, which does not run where a screen is
// drawn to a string: none of it touches a document that is not a browser's.

// `Symbol.for`: one identity however many copies of this module load.
const ShellHeadKey: InjectionKey<ShallowRef<ShellHead>> = Symbol.for('@niscorp/nova/adapters/vue:head');

export const HeadMark = defineComponent(
  () => {
    const head = inject(ShellHeadKey, undefined);
    onMounted(() => {
      if (head === undefined) return;
      watch(
        head,
        (current, _previous, onCleanup) => {
          current.enter();
          onCleanup(current.leave);
        },
        { immediate: true },
      );
    });
    return () => null;
  },
  { name: 'NovaHeadMark' },
);

export const provideShellHead = (shell: () => Shell): void => {
  let held = shell();
  const head = shallowRef(createShellHead(held));
  provide(ShellHeadKey, head);
  onMounted(() => {
    watch(
      shell,
      (next, _previous, onCleanup) => {
        if (next !== held) {
          held = next;
          head.value = createShellHead(next);
        }
        onCleanup(head.value.watch());
      },
      { immediate: true },
    );
  });
};
