import { defineComponent, h } from 'vue';

export type ErrorMarkerProps = {
  code: string;
  message: string;
};

export const ErrorMarker = defineComponent(
  (props: ErrorMarkerProps) => () => h('span', { 'data-nova-error': props.code, role: 'alert' }, `[${props.code}] ${props.message}`),
  { name: 'NovaErrorMarker', props: ['code', 'message'] },
);
