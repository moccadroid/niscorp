<script lang="ts">
  import { text } from '../../kit.shape';
  import { useRender, type Props } from '../context';
  import { modelOf, usePlace } from '../place';

  let props: Props = $props();

  const place = usePlace(() => props);
  const render = useRender();
  const onchange = (event: Event & { currentTarget: HTMLInputElement }): void => {
    const model = modelOf(props);
    if (model !== undefined) render.dispatch({ type: 'ui:model', ref: model, payload: event.currentTarget.checked });
  };
</script>

<label {...place()} class="check"><input type="checkbox" checked={props['value'] === true} {onchange} /><span>{text(props['label']) ?? ''}</span></label>
