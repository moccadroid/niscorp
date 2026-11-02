<script lang="ts">
  import { instantOf, remaining, text } from '../../kit.shape';
  import type { Props } from '../context';
  import { flag, usePlace } from '../place';

  let props: Props = $props();

  const place = usePlace(() => props);
  // On the viewer's clock: a tree re-sent every second would be a render a second for nothing.
  let now = $state(Date.now());
  const left = $derived(remaining(instantOf(text(props['to'])), now));
  const running = $derived(left.running);
  $effect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => clearInterval(timer);
  });
</script>

<div {...place()} class="figure countdown" data-done={flag(left.done)}><span class="label">{text(props['label']) ?? ''}</span><span class="value">{left.shown}</span></div>
