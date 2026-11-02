<script lang="ts">
  import { LEVELS, oneOf } from '../../kit';
  import type { Props } from '../context';
  import { usePlace } from '../place';

  let { children, ...props }: Props = $props();

  const place = usePlace(() => props);
  const level = $derived(oneOf(props['level'], LEVELS) ?? 'title');
</script>

<svelte:element this={level === 'display' ? 'h1' : 'h2'} {...place()} class="headline" data-level={level}>{@render children?.()}</svelte:element>
