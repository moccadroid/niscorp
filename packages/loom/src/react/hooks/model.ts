import { useNovaDispatch, type NovaModelBinding } from '@niscorp/nova/adapters/react';

// Returns a function that writes a new value to the field's bound path, through
// the same `ui:model` pipeline the built-in controls use. A control or a plugin
// widget calls it with its edited value.
export const useModelWrite = (model: NovaModelBinding | undefined): ((value: unknown) => void) => {
  const dispatch = useNovaDispatch();
  return (value) => {
    if (model !== undefined) dispatch({ type: 'ui:model', ref: model.ref, payload: value });
  };
};
