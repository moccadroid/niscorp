<script lang="ts">
  import { onDestroy } from 'svelte';
  import { oneOf } from '../../kit';
  import { text } from '../../kit.shape';
  import { useRender, type Props } from '../context';
  import { modelOf, usePlace } from '../place';

  let props: Props = $props();

  const place = usePlace(() => props);
  const render = useRender();
  // While the field has focus, what the person is typing is the value: a tree
  // arriving a round trip later must not overwrite it.
  let draft = $state<string | null>(null);
  let pending: { value: string; timer: ReturnType<typeof setTimeout> } | undefined;

  const send = (value: string): void => {
    const model = modelOf(props);
    if (model !== undefined) render.dispatch({ type: 'ui:model', ref: model, payload: value });
  };
  const flush = (): void => {
    if (pending === undefined) return;
    clearTimeout(pending.timer);
    const { value } = pending;
    pending = undefined;
    send(value);
  };
  const oninput = (event: Event & { currentTarget: HTMLInputElement }): void => {
    const value = event.currentTarget.value;
    draft = value;
    const wait = props['debounce'];
    if (typeof wait !== 'number' || wait <= 0) {
      send(value);
      return;
    }
    if (pending !== undefined) clearTimeout(pending.timer);
    pending = { value, timer: setTimeout(flush, wait) };
  };
  const onkeydown = (event: KeyboardEvent & { currentTarget: HTMLInputElement }): void => {
    const model = modelOf(props);
    if (model !== undefined) render.dispatch({ type: 'ui:key', ref: model, key: event.key });
    if (oneOf(props['enter'], ['clears'] as const) !== undefined && event.key === 'Enter') {
      draft = '';
      event.currentTarget.value = '';
    }
  };
  onDestroy(() => {
    if (pending !== undefined) clearTimeout(pending.timer);
  });
</script>

<input
  {...place()}
  type="text"
  class="field"
  spellcheck="false"
  autocomplete="off"
  placeholder={text(props['placeholder'])}
  value={draft ?? text(props['value']) ?? ''}
  onfocus={() => (draft = text(props['value']) ?? '')}
  onblur={() => {
    flush();
    draft = null;
  }}
  {oninput}
  {onkeydown}
/>
