<script lang="ts">
  import { renderNodeKey, type RenderNode } from '@niscorp/nova';
  import Node from './Node.svelte';

  let { nodes }: { nodes: readonly RenderNode[] } = $props();

  // Svelte refuses two equal keys in one list, and siblings may share a ref.
  const keyed = $derived.by(() => {
    const seen = new Map<string, number>();
    return nodes.map((node, index) => {
      const key = renderNodeKey(node, index);
      const count = seen.get(key) ?? 0;
      seen.set(key, count + 1);
      return { node, key: count === 0 ? key : `${key}#${count}` };
    });
  });
</script>

{#each keyed as item (item.key)}<Node node={item.node} />{/each}
