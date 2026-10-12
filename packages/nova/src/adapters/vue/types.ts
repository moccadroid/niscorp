import type { Component } from 'vue';
import type { ComponentMeta } from '@layout';
import type { NovaEvent } from '@shared/event-bus';

export type NovaDispatch = (event: NovaEvent) => void;
export type NovaPublish = (channel: string, payload?: unknown) => void;

export type NovaModelBinding = {
  ref: string;
  path: string;
};

export type NovaComponentProps = {
  novaModel?: NovaModelBinding;
  novaRef?: string;
};

export type NovaComponent = Component & {
  meta?: ComponentMeta;
};

export const isNovaComponent = (value: unknown): value is NovaComponent =>
  typeof value === 'function' || (typeof value === 'object' && value !== null);
