import { defineComponent, inject, onMounted, provide, shallowRef, watch, type InjectionKey, type ShallowRef } from 'vue';
import type { Shell } from '@shell';
import { createShellTitle, type ShellTitle } from '../../document/shell-title';

// ═══════════════════════════════════════════════════════════
// A head node (`nova:head`), in Vue — the twin of the React adapter's.
//
// It draws nothing. Where the shell lives in this page it says that it is on
// the screen, so the tab's title is read off the shell only while there is a
// head to read (document/shell-title). Under a served screen there is no shell
// here and nothing to say to: the terminal keeps the title off the wire.
//
// Everything here starts in `onMounted`, which does not run where a screen is
// drawn to a string — so none of it touches a document that is not a browser's.
// ═══════════════════════════════════════════════════════════

// `Symbol.for`, as the adapter's other keys are (./context).
const ShellTitleKey: InjectionKey<ShallowRef<ShellTitle>> = Symbol.for('@niscorp/nova/adapters/vue:title');

export const HeadMark = defineComponent(
  () => {
    const title = inject(ShellTitleKey, undefined);
    onMounted(() => {
      if (title === undefined) return;
      // a swapped shell has another title: leave the one, enter the other
      watch(
        title,
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

// Called in a provider's setup: every head below it reports to this shell's
// title, and the shell is watched for as long as the provider stands.
export const provideShellTitle = (shell: () => Shell): void => {
  let held = shell();
  const title = shallowRef(createShellTitle(held));
  provide(ShellTitleKey, title);
  onMounted(() => {
    watch(
      shell,
      (next, _previous, onCleanup) => {
        if (next !== held) {
          held = next;
          title.value = createShellTitle(next);
        }
        onCleanup(title.value.watch());
      },
      { immediate: true },
    );
  });
};
