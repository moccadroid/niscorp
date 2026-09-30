import { defineComponent, h } from 'vue';

export type ErrorMarkerProps = {
  code: string;
  message: string;
};

// Renders error RenderNodes surfaced by the renderer in lax mode.
// Consumers can style via the `data-nova-error` attribute.
export const ErrorMarker = defineComponent(
  (props: ErrorMarkerProps) => () => h('span', { 'data-nova-error': props.code, role: 'alert' }, `[${props.code}] ${props.message}`),
  { name: 'NovaErrorMarker', props: ['code', 'message'] },
);
