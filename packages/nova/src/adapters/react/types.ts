import type { ComponentType, ReactNode } from 'react';
import type { ComponentMeta } from '@layout';
import type { NovaEvent } from '@shared/event-bus';

export type NovaDispatch = (event: NovaEvent) => void;
export type NovaPublish = (channel: string, payload?: unknown) => void;

export type NovaModelBinding = {
  ref: string;
  path: string;
};

export type NovaComponentProps = {
  children?: ReactNode;
  novaModel?: NovaModelBinding;
  novaRef?: string;
};

export type NovaComponent<P = Record<string, unknown>> = ComponentType<NovaComponentProps & P> & {
  meta?: ComponentMeta;
};
