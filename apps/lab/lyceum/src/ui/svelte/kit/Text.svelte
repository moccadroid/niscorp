<script lang="ts">
  import { SIZES, oneOf } from '../../kit';
  import type { Props } from '../context';
  import { usePlace } from '../place';

  let { children, ...props }: Props = $props();

  const place = usePlace(() => props);
</script>

<p {...place()} class="text" data-tone={oneOf(props['tone'], ['muted'] as const)} data-size={oneOf(props['size'], SIZES)}>{@render children?.()}</p>
