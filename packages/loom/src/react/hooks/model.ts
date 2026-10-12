import { useNovaDispatch, type NovaModelBinding } from '@niscorp/nova/adapters/react';

export const useModelWrite = (model: NovaModelBinding | undefined): ((value: unknown) => void) => {
  const dispatch = useNovaDispatch();
  return (value) => {
    if (model !== undefined) dispatch({ type: 'ui:model', ref: model.ref, payload: value });
  };
};
