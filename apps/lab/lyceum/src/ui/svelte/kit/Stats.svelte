<script lang="ts">
  import { INKS, oneOf, records } from '../../kit';
  import { text } from '../../kit.shape';
  import type { Props } from '../context';
  import { usePlace } from '../place';

  let props: Props = $props();

  const place = usePlace(() => props);
</script>

<div {...place()} class="stats">{#each records(props['items']) as item}<div data-ink={oneOf(item['ink'], INKS)}><b>{text(item['value']) ?? '—'}</b><span>{text(item['label']) ?? ''}</span></div>{/each}</div>
