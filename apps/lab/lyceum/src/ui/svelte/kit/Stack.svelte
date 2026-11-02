<script lang="ts">
  import { GAPS, oneOf } from '../../kit';
  import type { Props } from '../context';
  import { usePlace } from '../place';

  let { children, ...props }: Props = $props();

  const place = usePlace(() => props);
</script>

<div {...place()} class="stack" data-gap={oneOf(props['gap'], GAPS)} data-scroll={oneOf(props['scroll'], ['y'] as const)}>{@render children?.()}</div>
