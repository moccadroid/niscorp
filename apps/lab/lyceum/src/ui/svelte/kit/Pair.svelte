<script lang="ts">
  import { SPLITS, oneOf } from '../../kit';
  import type { Props } from '../context';
  import { usePlace } from '../place';

  let { children, ...props }: Props = $props();

  const place = usePlace(() => props);
</script>

<div {...place()} class="pair" data-split={oneOf(props['split'], SPLITS)}>{@render children?.()}</div>
