<script lang="ts">
  import { text } from '../kit.shape';
  import { provideRender, useApi, useRender, type Props } from './context';
  import Tree from './Tree.svelte';

  let props: Props = $props();

  const api = useApi();
  const outer = useRender();
  const canvasId = $derived(text(props['canvasId']) ?? '');
  provideRender({ registry: outer.registry, dispatch: (event) => api.dispatch(canvasId, event), publish: outer.publish });

  const tree = $derived(canvasId === '' ? [] : api.canvasTree(canvasId));
</script>

<div data-canvas={canvasId}><Tree nodes={tree} /></div>
