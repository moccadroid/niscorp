<script lang="ts">
  import { NOVA_MODEL_PROP, NOVA_REF_PROP, isHeadNode, type RenderNode } from '@niscorp/nova';
  import { useRender } from './context';
  import Tree from './Tree.svelte';

  let { node }: { node: RenderNode } = $props();

  const render = useRender();

  const Component = $derived(node.type === 'component' && !isHeadNode(node) ? render.registry.get(node.name)?.component : undefined);
  const props = $derived.by(() => {
    if (node.type !== 'component') return {};
    const props: Record<string, unknown> = { ...node.props };
    if (node.model !== undefined) props[NOVA_MODEL_PROP] = { ref: node.model.ref, path: node.model.path };
    if (node.ref !== undefined) props[NOVA_REF_PROP] = node.ref;
    return props;
  });
  // A head is the document's: it is not handed to the component as a child.
  const shown = $derived(node.type === 'component' ? node.children.filter((child) => !isHeadNode(child)) : []);
</script>

{#if node.type === 'text'}{node.value}{:else if node.type === 'fragment'}<Tree nodes={node.children} />{:else if node.type === 'error'}<span data-nova-error={node.code} role="alert">[{node.code}] {node.message}</span>{:else if isHeadNode(node)}{:else if Component === undefined}<span data-nova-error="COMPONENT_NOT_FOUND" role="alert">[COMPONENT_NOT_FOUND] {node.name}</span>{:else}<Component {...props}><Tree nodes={shown} /></Component>{/if}
