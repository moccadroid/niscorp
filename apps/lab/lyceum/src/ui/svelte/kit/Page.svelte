<script lang="ts">
  import type { Props } from '../context';

  let { children }: Props = $props();
</script>

<div class="page">{@render children?.()}<span class="renderer">Svelte</span></div>
