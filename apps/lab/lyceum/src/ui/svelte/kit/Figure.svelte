<script lang="ts">
  import { text } from '../../kit.shape';
  import type { Props } from '../context';
  import { usePlace } from '../place';

  let props: Props = $props();

  const place = usePlace(() => props);
</script>

<div {...place()} class="figure"><span class="label">{text(props['label']) ?? ''}</span><span class="value">{text(props['value']) ?? '—'}</span></div>
