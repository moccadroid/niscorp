<script lang="ts">
  import { INKS, MARKS, oneOf, records } from '../../kit';
  import { text } from '../../kit.shape';
  import type { Props } from '../context';
  import { usePlace } from '../place';

  let props: Props = $props();

  const place = usePlace(() => props);
  const bars = $derived(records(props['bars']));
  const values = $derived(bars.map((bar) => (typeof bar['value'] === 'number' && bar['value'] > 0 ? bar['value'] : 0)));
  const most = $derived(Math.max(1, ...values));
</script>

<div {...place()} class="columns">{#each bars as bar, index}<div class="columns-bar"><div class="columns-track"><span class="columns-fill" style="height: {((values[index] ?? 0) / most) * 100}%" data-ink={oneOf(bar['ink'], INKS)} data-mark={oneOf(bar['mark'], MARKS)}><span class="columns-value">{text(bar['value']) ?? '0'}</span></span></div><span class="label">{text(bar['label']) ?? ''}</span></div>{/each}</div>
