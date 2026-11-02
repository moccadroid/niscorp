import { getContext, setContext } from 'svelte';
import type { Component, Snippet } from 'svelte';
import type { ComponentRegistry, NovaEvent } from '@niscorp/nova';
import type { TerminalApi } from '@niscorp/moss/terminal';

export type Props = Record<string, unknown> & { children?: Snippet };
export type SvelteKitComponent = Component<Props>;

export type Render = {
  registry: ComponentRegistry<SvelteKitComponent>;
  dispatch: (event: NovaEvent) => void;
  publish: (channel: string, payload?: unknown) => void;
};

const RENDER = Symbol('lyceum.svelte.render');
const API = Symbol('lyceum.svelte.api');
const NARROW = Symbol('lyceum.svelte.narrow');

export const provideRender = (render: Render): void => void setContext(RENDER, render);
export const useRender = (): Render => {
  const render = getContext<Render | undefined>(RENDER);
  if (render === undefined) throw new Error('a Svelte kit component was drawn outside the Svelte frame');
  return render;
};

// The frame is chrome: events come only from inside a canvas.
export const frameContext = (api: TerminalApi, registry: Render['registry']): Map<symbol, unknown> =>
  new Map<symbol, unknown>([
    [API, api],
    [RENDER, { registry, dispatch: () => undefined, publish: (channel, payload) => api.publish(channel, payload) } satisfies Render],
  ]);

export const useApi = (): TerminalApi => {
  const api = getContext<TerminalApi | undefined>(API);
  if (api === undefined) throw new Error('a Svelte slot was drawn outside the Svelte frame');
  return api;
};

export const provideNarrow = (names: () => Set<string> | undefined): void => void setContext(NARROW, names);
export const useNarrow = (): (() => Set<string> | undefined) => getContext<(() => Set<string> | undefined) | undefined>(NARROW) ?? (() => undefined);
