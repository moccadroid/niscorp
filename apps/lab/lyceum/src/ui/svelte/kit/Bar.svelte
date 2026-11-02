<script lang="ts">
  import { INKS, MARKS, oneOf, records } from '../../kit';
  import { text } from '../../kit.shape';
  import type { Props } from '../context';
  import { usePlace } from '../place';

  let props: Props = $props();

  const place = usePlace(() => props);
  const segments = $derived(records(props['segments']).filter((segment) => typeof segment['value'] === 'number' && segment['value'] > 0));
</script>

<div {...place({ gridTemplateColumns: segments.map((segment) => `${text(segment['value']) ?? '1'}fr`).join(' ') || '1fr' })} class="bar">{#each segments as segment}<span data-ink={oneOf(segment['ink'], INKS)} data-mark={oneOf(segment['mark'], MARKS)}></span>{/each}</div>
