<script lang="ts">
  import { useApi } from './context';
  import Tree from './Tree.svelte';

  const api = useApi();
  const frame = $derived(api.frame());
</script>

<Tree nodes={frame} />
