// @vitest-environment jsdom
import type { FC, ReactNode } from 'react';
import { vi } from 'vitest';
import { createComponentRegistry, type ComponentRegistry } from '@layout';
import {
  NovaRenderProvider,
  type NovaComponent,
  type NovaDispatch,
  type NovaPublish,
} from '@react';

export type RenderHarness = {
  Wrapper: FC<{ children?: ReactNode }>;
  dispatch: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
  registry: ComponentRegistry<NovaComponent>;
};

export const createHarness = (): RenderHarness => {
  const registry = createComponentRegistry<NovaComponent>();
  const dispatch = vi.fn();
  const publish = vi.fn();
  const dispatchFn: NovaDispatch = (event) => dispatch(event);
  const publishFn: NovaPublish = (channel, payload) => publish(channel, payload);
  const Wrapper: FC<{ children?: ReactNode }> = ({ children }) => (
    <NovaRenderProvider registry={registry} dispatch={dispatchFn} publish={publishFn}>
      {children}
    </NovaRenderProvider>
  );
  return { Wrapper, dispatch, publish, registry };
};
