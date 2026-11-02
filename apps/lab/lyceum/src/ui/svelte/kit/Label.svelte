<script lang="ts">
  import type { Props } from '../context';
  import { usePlace } from '../place';

  let { children, ...props }: Props = $props();

  const place = usePlace(() => props);
</script>

<span {...place()} class="label">{@render children?.()}</span>
