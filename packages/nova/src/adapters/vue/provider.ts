import { defineComponent, h, provide } from 'vue';
import type { ComponentRegistry } from '@layout';
import type { Shell } from '@shell';
import { NovaRenderKey, NovaShellKey, type NovaRenderContextValue, type NovaShellSource, type SlotWrapper } from './context';
import { provideShellHead } from './head';
import type { NovaComponent, NovaDispatch, NovaPublish } from './types';

const noopDispatch: NovaDispatch = () => {};
const noopPublish: NovaPublish = () => {};

export type NovaRenderProviderProps = {
  registry: ComponentRegistry;
  dispatch?: NovaDispatch;
  publish?: NovaPublish;
  slotWrapper?: SlotWrapper;
  fallback?: NovaComponent;
};

export const NovaRenderProvider = defineComponent(
  (props: NovaRenderProviderProps, { slots }) => {
    const value: NovaRenderContextValue = {
      get registry() {
        return props.registry;
      },
      get dispatch() {
        return props.dispatch ?? noopDispatch;
      },
      get publish() {
        return props.publish ?? noopPublish;
      },
      get slotWrapper() {
        return props.slotWrapper;
      },
      get fallback() {
        return props.fallback;
      },
    };
    provide(NovaRenderKey, value);
    return () => slots.default?.();
  },
  { name: 'NovaRenderProvider', props: ['registry', 'dispatch', 'publish', 'slotWrapper', 'fallback'] },
);

export type NovaShellProviderProps = {
  shell: Shell;
  registry?: ComponentRegistry;
  slotWrapper?: SlotWrapper;
};

export const NovaShellProvider = defineComponent(
  (props: NovaShellProviderProps, { slots }) => {
    const source: NovaShellSource = {
      get shell() {
        return props.shell;
      },
    };
    provide(NovaShellKey, source);
    provideShellHead(() => props.shell);
    const dispatch: NovaDispatch = (event) => props.shell.dispatch(event);
    const publish: NovaPublish = (channel, payload) => props.shell.publish(channel, payload);
    return () =>
      h(
        NovaRenderProvider,
        { registry: props.registry ?? props.shell.registry, dispatch, publish, slotWrapper: props.slotWrapper },
        { default: () => slots.default?.() },
      );
  },
  { name: 'NovaShellProvider', props: ['shell', 'registry', 'slotWrapper'] },
);
