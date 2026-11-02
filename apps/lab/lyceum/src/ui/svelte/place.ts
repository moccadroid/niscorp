import { NOVA_MODEL_PROP, NOVA_REF_PROP } from '@niscorp/nova';
import { areaOf, text } from '../kit.shape';
import { useNarrow, useRender, type Props } from './context';

export const css = (style: Record<string, string>): string | undefined => {
  const parts = Object.entries(style).map(([key, value]) => `${key.startsWith('--') ? key : key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}: ${value}`);
  return parts.length === 0 ? undefined : parts.join('; ');
};

export const flag = (on: boolean): '' | undefined => (on ? '' : undefined);

export const modelOf = (props: Props): string | undefined => {
  const model = props[NOVA_MODEL_PROP];
  return typeof model === 'object' && model !== null ? text(Reflect.get(model, 'ref')) : undefined;
};

// What every kit element carries from its node: its grid area, whether the
// enclosing sheet's narrow arrangement leaves it out, and its `ref`'s press.
export const usePlace = (propsOf: () => Props): ((style?: Record<string, string>) => Record<string, unknown>) => {
  const render = useRender();
  const narrow = useNarrow();
  return (style = {}) => {
    const props = propsOf();
    const area = areaOf(props['area']);
    const ref = text(props[NOVA_REF_PROP]);
    const names = narrow();
    return {
      style: css(area === undefined ? style : { ...style, gridArea: area }),
      'data-narrow-hidden': flag(area !== undefined && names !== undefined && !names.has(area)),
      'data-ref': ref,
      onclick:
        ref === undefined || props[NOVA_MODEL_PROP] !== undefined
          ? undefined
          : (event: Event) => {
              event.stopPropagation();
              const value = props['value'];
              render.dispatch(value === undefined ? { type: 'ui:click', ref } : { type: 'ui:click', ref, payload: value });
            },
    };
  };
};
