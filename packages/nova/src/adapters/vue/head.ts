import { defineComponent, inject, onMounted, provide, shallowRef, watch, type InjectionKey, type ShallowRef } from 'vue';
import type { Shell } from '@shell';
import { createShellHead, type ShellHead } from '../../document/shell-head';

// ═══════════════════════════════════════════════════════════
// A head node (`nova:head`), in Vue — the twin of the React adapter's.
//
// It draws nothing, and neither does anything it holds. Where the shell lives
// in this page it says that it is on the screen, so the page's head is read
// off the shell only while there is one to read (document/shell-head). Under a
// served screen there is no shell here and nothing to say to: the terminal
// keeps the head off the wire.
//
// Everything here starts in `onMounted`, which does not run where a screen is
// drawn to a string — so none of it touches a document that is not a browser's.
// ═══════════════════════════════════════════════════════════

// `Symbol.for`, as the adapter's other keys are (./context).
const ShellHeadKey: InjectionKey<ShallowRef<ShellHead>> = Symbol.for('@niscorp/nova/adapters/vue:head');

export const HeadMark = defineComponent(
  () => {
    const head = inject(ShellHeadKey, undefined);
    onMounted(() => {
      if (head === undefined) return;
      // a swapped shell has another head: leave the one, enter the other
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

// Called in a provider's setup: every head below it reports to this shell's,
// and the shell is watched for as long as the provider stands.
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
